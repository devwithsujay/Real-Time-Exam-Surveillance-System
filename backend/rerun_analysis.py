"""
Rerun Anomaly Analysis using Qwen3-VL (qwen/qwen3-vl-4b)
This script re-analyzes all anomaly evidence screenshots in the database
using the high-accuracy Qwen3 Vision Language Model on LM Studio.
"""

import sys
import os
import time
import json
import base64
import asyncio
import httpx
from typing import Dict, Any, Optional

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import Event
from app.config import get_settings

settings = get_settings()
MODEL_NAME = "qwen/qwen3-vl-4b"
LM_STUDIO_URL = f"{settings.VLM_BASE_URL}/chat/completions"
CONCURRENCY_LIMIT = 4

PROMPT = (
    "You are an expert AI examination invigilator and forensic proctor analyzing a high-resolution surveillance snapshot of an examinee.\n"
    "Perform a rigorous behavioral and forensic inspection of the candidate and desk area for any integrity violations:\n"
    "1. MOBILE_PHONE: Using, touching, holding, or glancing at a smartphone, glowing screen, or concealed handheld device.\n"
    "2. UNAUTHORIZED_MATERIAL: Cheat sheets, unauthorized notes, paper slips under desk/lap, or books.\n"
    "3. WEARABLE_AUDIO: In-ear wireless earbuds, airpods, headphones, or smart communication earpiece visible.\n"
    "4. COLLABORATION / PEEKING: Turning head/body to look at neighbor's exam paper, whispering, gesturing, or copying.\n"
    "5. SUSPICIOUS POSTURE: Abnormally leaning sideways out of seat, hands hidden beneath desk, or obscured face.\n"
    "\n"
    "NORMAL BEHAVIORS (DO NOT FALSELY FLAG AS CHEATING):\n"
    "- Writing with a pen/pencil on the desk.\n"
    "- Looking down directly at exam paper on desk.\n"
    "- Resting chin or hand on cheek while thinking/reading.\n"
    "\n"
    "Return ONLY a valid, raw JSON object matching this schema:\n"
    "{\n"
    '  "phone_detected": boolean,\n'
    '  "cheating_detected": boolean,\n'
    '  "talking_detected": boolean,\n'
    '  "earbud_detected": boolean,\n'
    '  "peeking_detected": boolean,\n'
    '  "detected_objects": ["pen", "exam paper", ...],\n'
    '  "description": "Precise, objective 1-2 sentence description of examinee posture, hands, gaze, and observed behavior",\n'
    '  "confidence": float between 0.50 and 0.99\n'
    "}"
)


def parse_vlm_output(text: str) -> Dict[str, Any]:
    """Parse JSON output from Qwen3 response, with fallback heuristics."""
    try:
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end])
            return {
                "phone_detected": bool(parsed.get("phone_detected", False)),
                "cheating_detected": bool(parsed.get("cheating_detected", False)),
                "talking_detected": bool(parsed.get("talking_detected", False)),
                "earbud_detected": bool(parsed.get("earbud_detected", False)),
                "peeking_detected": bool(parsed.get("peeking_detected", False)),
                "detected_objects": parsed.get("detected_objects", []),
                "description": str(parsed.get("description", "")).strip(),
                "confidence": float(parsed.get("confidence", 0.85)),
                "raw_response": text
            }
    except Exception:
        pass

    lower = text.lower()
    phone = "phone" in lower and ("using" in lower or "holding" in lower or "detected\": true" in lower)
    cheat = "cheat" in lower or "hidden notes" in lower or "unauthorized" in lower
    earbud = "earbud" in lower or "headphone" in lower or "airpod" in lower
    talking = "talking" in lower or "speaking" in lower or "whispering" in lower
    peeking = "peeking" in lower or "looking at neighbor" in lower or "leaning sideways" in lower

    return {
        "phone_detected": phone,
        "cheating_detected": cheat,
        "talking_detected": talking,
        "earbud_detected": earbud,
        "peeking_detected": peeking,
        "detected_objects": [],
        "description": text[:200].strip(),
        "confidence": 0.85 if (phone or cheat or earbud or talking or peeking) else 0.70,
        "raw_response": text
    }


async def analyze_image(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    img_path: str,
    index: int,
    total: int
) -> Optional[Dict[str, Any]]:
    """Analyze a single screenshot using Qwen3-VL."""
    if not os.path.exists(img_path):
        return None

    try:
        with open(img_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"[{index}/{total}] Error reading {img_path}: {e}")
        return None

    payload = {
        "model": MODEL_NAME,
        "max_tokens": 300,
        "temperature": 0.1,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                    },
                    {"type": "text", "text": PROMPT}
                ]
            }
        ]
    }

    async with semaphore:
        t0 = time.time()
        for attempt in range(2):
            try:
                resp = await client.post(LM_STUDIO_URL, json=payload, timeout=60.0)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    parsed = parse_vlm_output(content)
                    elapsed = time.time() - t0
                    short_desc = parsed["description"][:80] + "..." if len(parsed["description"]) > 80 else parsed["description"]
                    flags = []
                    if parsed["phone_detected"]: flags.append("PHONE")
                    if parsed["cheating_detected"]: flags.append("CHEAT")
                    if parsed["talking_detected"]: flags.append("TALK")
                    if parsed["earbud_detected"]: flags.append("EARBUD")
                    if parsed["peeking_detected"]: flags.append("PEEK")
                    flag_str = f" [{', '.join(flags)}]" if flags else " [NORMAL]"
                    print(f"[{index}/{total}] ({elapsed:.1f}s){flag_str}: {short_desc}")
                    return parsed
                else:
                    print(f"[{index}/{total}] Warning: HTTP {resp.status_code}")
            except Exception as e:
                if attempt == 0:
                    await asyncio.sleep(1.0)
                else:
                    print(f"[{index}/{total}] Failed after retry: {e}")
        return None


async def run_batch_analysis():
    print(f"=== Starting Anomaly Re-Analysis with Qwen3 ({MODEL_NAME}) ===")
    print(f"Target LM Studio endpoint: {LM_STUDIO_URL}")
    print(f"Concurrency workers: {CONCURRENCY_LIMIT}")

    db = SessionLocal()
    try:
        events = db.query(Event).all()
        total_events = len(events)
        print(f"Found {total_events} total events in database.")

        # Collect unique screenshot paths
        unique_paths = list(set(
            e.evidence_screenshot_path for e in events
            if e.evidence_screenshot_path and os.path.exists(e.evidence_screenshot_path)
        ))
        total_unique = len(unique_paths)
        print(f"Found {total_unique} unique screenshot files to analyze with Qwen3.\n")

        cache_results: Dict[str, Dict[str, Any]] = {}
        semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

        t_start = time.time()
        async with httpx.AsyncClient() as client:
            tasks = [
                analyze_image(client, semaphore, p, i + 1, total_unique)
                for i, p in enumerate(unique_paths)
            ]
            results = await asyncio.gather(*tasks)

        for p, res in zip(unique_paths, results):
            if res:
                cache_results[p] = res

        elapsed_total = time.time() - t_start
        print(f"\nCompleted inference for {len(cache_results)}/{total_unique} screenshots in {elapsed_total:.1f}s.")
        print(f"Average speed: {elapsed_total / max(1, len(cache_results)):.2f}s per image.\n")

        # Update events in database
        print("Updating events in database...")
        updated_count = 0
        phone_count = 0
        cheat_count = 0
        earbud_count = 0
        talking_count = 0
        peeking_count = 0

        for e in events:
            path = e.evidence_screenshot_path
            if path and path in cache_results:
                analysis = cache_results[path]
                
                # Update description
                if analysis.get("description"):
                    e.description = analysis["description"]
                
                # Update confidence
                if analysis.get("confidence"):
                    e.confidence = analysis["confidence"]

                # Parse and update analysis_data JSON
                existing_data = {}
                if e.analysis_data:
                    try:
                        existing_data = json.loads(e.analysis_data) if isinstance(e.analysis_data, str) else e.analysis_data
                    except Exception:
                        existing_data = {}

                existing_data["vlm_model"] = MODEL_NAME
                existing_data["vlm_reasoning"] = analysis.get("description", "")
                existing_data["vlm_response"] = json.dumps(analysis, indent=2)
                existing_data["qwen_analysis"] = analysis
                e.analysis_data = json.dumps(existing_data)

                if analysis.get("phone_detected"): phone_count += 1
                if analysis.get("cheating_detected"): cheat_count += 1
                if analysis.get("earbud_detected"): earbud_count += 1
                if analysis.get("talking_detected"): talking_count += 1
                if analysis.get("peeking_detected"): peeking_count += 1

                updated_count += 1

        db.commit()
        print("Database commit successful.")
        print(f"\n=======================================================")
        print(f"  ANALYSIS COMPLETE SUMMARY")
        print(f"=======================================================")
        print(f"  Total events in DB:       {total_events}")
        print(f"  Total events re-analyzed: {updated_count}")
        print(f"  Unique images processed:  {len(cache_results)}")
        print(f"  Model used:               {MODEL_NAME}")
        print(f"  Total time elapsed:       {elapsed_total:.1f} seconds")
        print(f"  Detections Breakdown (Qwen3 Forensic Assessment):")
        print(f"    - Mobile Phone:         {phone_count}")
        print(f"    - Unauthorized Notes:   {cheat_count}")
        print(f"    - Wireless Earbuds:     {earbud_count}")
        print(f"    - Verbal Communication: {talking_count}")
        print(f"    - Peeking / Gaze Shift: {peeking_count}")
        print(f"=======================================================\n")

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run_batch_analysis())
