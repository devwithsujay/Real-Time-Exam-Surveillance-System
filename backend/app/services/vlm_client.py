import os
import asyncio
import time
import json
import base64
import logging
from typing import Optional, List
from dataclasses import dataclass, field

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class VLMResult:
    phone_detected: bool = False
    cheating_detected: bool = False
    suspicious_text: bool = False
    talking_detected: bool = False
    earbud_detected: bool = False
    peeking_detected: bool = False
    seat_violation_detected: bool = False
    plausible: Optional[bool] = None
    verdict: Optional[str] = None
    quick_reasoning: Optional[str] = None
    visibility: Optional[str] = None
    detected_objects: List[str] = field(default_factory=list)
    description: str = ""
    confidence: float = 0.0
    violating_seats: List[str] = field(default_factory=list)
    raw_response: str = ""
    inference_time_ms: float = 0.0


def build_unified_prompt(
    candidate_category: Optional[str] = None,
    description: Optional[str] = None,
    custom_question: Optional[str] = None
) -> str:
    """
    Standard Single Prompt for Live Exam Surveillance & On-Demand Proctor Verification.
    Direct, fast, and optimized for local vision models (Qwen-VL, Moondream, LLaVA).
    """
    context_section = ""
    if custom_question:
        context_section = f"The invigilator has asked a specific question: \"{custom_question}\". Answer accurately based strictly on what is visible.\n\n"
    elif candidate_category:
        desc_str = f" ({description})" if description else ""
        context_section = f"Verification Context: The automated surveillance detector flagged possible [{candidate_category}]{desc_str}. Verify whether this violation is actually visible in the image.\n\n"

    return (
        "You are an AI exam proctor analyzing a live surveillance snapshot of a student at an exam desk.\n"
        f"{context_section}"
        "Inspect the image for these suspicious indicators:\n"
        "1. MOBILE_PHONE: Person holding, using, or looking at a mobile phone or glowing screen.\n"
        "2. UNAUTHORIZED_NOTES: Loose cheat sheets, unauthorized paper slips, or notes concealed under desk/lap.\n"
        "3. WEARABLE_AUDIO: In-ear earbuds, headphones, or bluetooth earpiece visible on either ear.\n"
        "4. SEAT_VIOLATION: Student standing up, leaving chair/desk, vacating seat, or moving places.\n"
        "5. COMMUNICATION: Actively turning and speaking or gesturing to another person.\n"
        "6. PEEKING_AT_NEIGHBOR: Person turning head or leaning sideways to look at an adjacent candidate's exam desk or paper.\n"
        "\n"
        "CRITICAL RULES:\n"
        "- Writing on an exam paper on the desk with a pen/pencil/eraser is NORMAL behavior, NOT cheating.\n"
        "- Looking down directly at the exam paper on the desk is NORMAL behavior.\n"
        "- Resting chin on hand, adjusting glasses/mask, or touching ear/hair is NORMAL behavior, NOT an earbud.\n"
        "- An invigilator, teacher, or proctor standing upright or patrolling classroom aisles or standing near desks is AUTHORIZED personnel, NOT a seat violation or cheating.\n"
        "\n"
        "Return ONLY a raw JSON object matching this schema:\n"
        "{\n"
        '  "phone_detected": boolean,\n'
        '  "cheating_detected": boolean,\n'
        '  "talking_detected": boolean,\n'
        '  "earbud_detected": boolean,\n'
        '  "peeking_detected": boolean,\n'
        '  "verdict": "CONFIRMED_VIOLATION" | "FALSE_POSITIVE",\n'
        '  "detected_objects": ["desk", "paper", "pen"],\n'
        '  "description": "1 brief sentence summarizing visible student activity",\n'
        '  "confidence": float between 0.0 and 1.0\n'
        "}"
    )


# Compatibility aliases ensuring zero breakages across codebase
def build_instant_surety_prompt(candidate_category: str = "", cv_confidence: float = 0.85, bbox: Optional[dict] = None) -> str:
    return build_unified_prompt(candidate_category=candidate_category)


def build_forensic_reanalysis_prompt(event_type: str = "", description: str = "") -> str:
    return build_unified_prompt(candidate_category=event_type, description=description)


def build_custom_query_prompt(custom_question: str) -> str:
    return build_unified_prompt(custom_question=custom_question)


def build_multiframe_proctor_prompt(
    n_frames: int = 1,
    interval: float = 0.0,
    camera_angle: str = "desk-level exam surveillance",
    seat_labels: str = "S1 (candidate), S2 (adjacent neighbor)",
    exam_rules: str = "closed book; no phones, notes or earphones; calculators not allowed"
) -> str:
    """
    Gold-Standard Proctoring Prompt supporting single snapshot or multi-frame sequences.
    Detects covert device behavior, directional neighbor peeking, mutual gaze, communication,
    and unauthorized notes while enforcing strict non-violation exclusions.
    """
    if n_frames == 1:
        return (
            "You are an AI exam proctor monitoring an exam room.\n"
            f"Camera view: {camera_angle}. Students visible: {seat_labels}. Exam rules: {exam_rules}.\n\n"
            "CRITICAL INVIGILATOR / TEACHER EDGE CASE RULE:\n"
            "- A person who is standing upright, walking along the classroom aisles or walkways, supervising the room, holding papers, or standing near student desks is an AUTHORIZED INVIGILATOR / TEACHER / PROCTOR performing their duties.\n"
            "- Do NOT flag a standing or patrolling invigilator/teacher as a SEAT_VIOLATION, leaving seat, standing up, or vacating desk.\n"
            "- Do NOT flag an invigilator standing near or behind a student's desk as 'two students sharing one desk' or 'crowding'. Legitimate invigilator inspection is NOT a violation.\n"
            "- Do NOT flag brief administrative conversation between invigilator and student (e.g. signing attendance or answering questions) as unauthorized communication.\n"
            "- ONLY flag a SEAT_VIOLATION if an actual seated EXAMINEE/STUDENT stands up, abandons their desk, moves places, or two examinees crowd onto one desk.\n\n"
            "Carefully inspect each examinee:\n"
            "1. SEAT_VIOLATION: Flag ONLY if a seated examinee stands up, leaves their seat, vacates desk, moves places, or two examinees crowd onto one desk.\n"
            "2. CHIT_PASSING: Check if any student is passing a chit, paper slip, or note, or reaching an arm/hand toward a neighbor or behind a chair.\n"
            "3. PEEKING: Check if any student is turning their head sideways or leaning across desks toward another student or desk.\n"
            "4. PHONE: Check for any mobile phone, cheat sheet, unauthorized materials, or earphones held by a student.\n"
            "5. COMMUNICATION: Check if any students are actively talking or whispering to each other while seated.\n\n"
            "Decide if any suspicious proctoring violation exists:\n"
            "- If all candidates are seated writing normally, and any standing/walking person is an invigilator/teacher patrolling the aisles or standing near desks, output:\n"
            "{\n"
            '  "violation": false,\n'
            '  "reason": "Candidates seated writing quietly at assigned desks; invigilator patrolling aisles"\n'
            "}\n\n"
            "- If an actual candidate anomaly is observed (examinee standing up, leaving seat, moving places, sharing desk, passing chit, peeking, or holding phone), output:\n"
            "{\n"
            '  "violation": true,\n'
            '  "type": "SEAT_VIOLATION" | "CHIT_PASSING" | "PEEKING" | "PHONE" | "CHEATING" | "COMMUNICATION",\n'
            '  "seat": "S1" | "S2" | "S3",\n'
            '  "confidence": 0.85 to 1.0,\n'
            '  "reason": "factual description of the observed student violation (e.g. Student S1 stood up and moved from their seat / vacated desk)"\n'
            "}\n"
            "Output valid JSON only with no preamble."
        )

    input_desc = f"INPUT: {n_frames} consecutive frames, about {interval} seconds apart, from a {camera_angle} camera. Students are identified by seat label: {seat_labels}."
    decide_rule = "STEP 2 - DECIDE each indicator using these rules. Answer \"yes\" only if the criteria are met across the frames. A single frame is never enough."
    gaze_example = '["paper", "lap", "paper"]'

    return (
        "You are an exam-proctoring analysis assistant. Your output goes to a HUMAN REVIEWER, who makes all decisions. "
        "You report only what is clearly visible. A false accusation is worse than a missed ambiguous case. "
        "Never infer intent. If evidence is partial, occluded, blurry, or ambiguous, answer \"uncertain\", never \"yes\".\n\n"
        f"{input_desc}\n"
        f"EXAM RULES: {exam_rules}.\n\n"
        "STEP 1 - OBSERVE (do this first, facts only):\n"
        "For each visible student, note: head direction (exam paper / lap / left neighbor / right neighbor / ahead / up / other), "
        "whether both hands are visible on the desk, and anything held or worn. Then note any paper or object near the boundary between two desks.\n\n"
        f"{decide_rule}\n\n"
        "1. phone_visible: a phone or glowing handheld screen is clearly seen in hand, lap, or under the desk.\n\n"
        "2. hidden_device_behavior (for phones that cannot be seen): ALL of these:\n"
        "   - head tilted down toward the lap or below the desk edge, NOT toward the exam paper,\n"
        "   - at least one hand out of view below the desk, and not holding a pen,\n"
        "   Screen glow on the face or lap strengthens this.\n\n"
        "3. unauthorized_notes: loose paper, slips or written notes that are separate from the exam paper AND are hidden, held below the desk, or concealed.\n\n"
        "4. wearable_audio: an earbud, headphone or earpiece clearly inserted in or covering an ear. Hearing aids and earplugs are NOT violations.\n\n"
        "5. peeking: head AND eyes are clearly directed at a neighbor's paper or desk. A sideways head turn alone is not peeking.\n\n"
        "6. mutual_gaze (pair of adjacent students): BOTH students are facing each other. Brief eye contact is normal.\n\n"
        "7. communication: mutual gaze OR one student turned toward another, PLUS speaking or gesturing visible. One open mouth is not enough.\n\n"
        "8. paper_exchange: a sheet or object moves from one student's desk area into another's, or is held between two students. Name the direction and object. Passing a pen or an invigilator handling papers is NOT a violation.\n\n"
        "NORMAL BEHAVIOR (never flag): writing; reading the exam paper; looking up, around or at the ceiling while thinking; looking at a clock; stretching, yawning, rubbing eyes; hand on face, chin or ear; adjusting hair, glasses or clothing; drinking water; raising a hand; permitted items; hearing aids, medical devices, religious or cultural head coverings; an invigilator walking past or standing near a student.\n\n"
        "Do NOT flag a student for how they look. Judge only observable actions.\n\n"
        "MULTI-STUDENT REQUIREMENT: Include an entry in the 'students' array for EACH labeled student visible in the image (e.g. S1, S2, S3, S4...). Include an entry in 'pairs' for each adjacent pair (e.g. [S1, S2], [S2, S3]). Never evaluate only S1 if multiple students are present.\n\n"
        "STEP 3 - OUTPUT ONLY this JSON, with no markdown and no extra text:\n"
        "{\n"
        f'  "frames_analyzed": {n_frames},\n'
        '  "observations": "3-4 factual sentences on what is visible, no conclusions",\n'
        '  "image_quality_issues": "occlusion, blur, low light, small faces, or none",\n'
        '  "students": [\n'
        "    {\n"
        '      "seat": "S1",\n'
        f'      "gaze_per_frame": {gaze_example},\n'
        '      "hands_visible_on_desk": "both",\n'
        '      "phone_visible": {"verdict": "no", "confidence": 0.0},\n'
        '      "hidden_device_behavior": {"verdict": "no", "confidence": 0.0, "frames_supporting": 0},\n'
        '      "unauthorized_notes": {"verdict": "no", "confidence": 0.0},\n'
        '      "wearable_audio": {"verdict": "no", "confidence": 0.0},\n'
        '      "peeking": {"verdict": "no", "confidence": 0.0, "toward_seat": "none"}\n'
        "    }\n"
        "  ],\n"
        '  "pairs": [\n'
        "    {\n"
        '      "seats": ["S1", "S2"],\n'
        '      "mutual_gaze": {"verdict": "no", "confidence": 0.0, "frames_supporting": 0},\n'
        '      "communication": {"verdict": "no", "confidence": 0.0},\n'
        '      "paper_exchange": {\n'
        '        "verdict": "no",\n'
        '        "confidence": 0.0,\n'
        '        "direction": "none",\n'
        '        "object": "none"\n'
        '      }\n'
        "    }\n"
        "  ],\n"
        '  "invigilator_present": false,\n'
        '  "needs_human_review": false,\n'
        '  "review_reason": ""\n'
        "}\n\n"
        "Set needs_human_review to true if ANY indicator is \"yes\", or if two or more are \"uncertain\" for the same student or pair. Otherwise false."
    )


class LMStudioVLM:
    """Vision Language Model client supporting both LM Studio and Ollama (LLaVA / Moondream / Qwen)."""

    PROMPT_TEMPLATE = build_multiframe_proctor_prompt(n_frames=1)



    def __init__(self):
        self.provider = getattr(settings, "VLM_PROVIDER", "lmstudio").lower()
        if self.provider == "ollama":
            self.base_url = getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434").rstrip('/')
            self.model = getattr(settings, "OLLAMA_MODEL", "llava:latest")
        else:
            self.base_url = settings.VLM_BASE_URL.rstrip('/')
            self.model = settings.VLM_MODEL
        self.max_tokens = settings.VLM_MAX_TOKENS
        self.timeout = settings.VLM_TIMEOUT
        self.connect_timeout = getattr(settings, "VLM_CONNECT_TIMEOUT", 2.0)
        self.http_timeout = httpx.Timeout(self.timeout, connect=self.connect_timeout)
        self.enabled = settings.VLM_ENABLED
        self._client: Optional[httpx.AsyncClient] = None
        self._available = False
        self._cached_available = False
        self._monitor_task: Optional[asyncio.Task] = None

    def set_provider(self, provider: str, base_url: Optional[str] = None, model: Optional[str] = None):
        """Switch VLM provider (e.g. 'lmstudio' or 'ollama') and reconfigure endpoint."""
        self.provider = provider.lower()
        if self.provider == "ollama":
            self.base_url = (base_url or getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")).rstrip('/')
            self.model = model or getattr(settings, "OLLAMA_MODEL", "llava:latest")
        else:
            self.base_url = (base_url or settings.VLM_BASE_URL).rstrip('/')
            self.model = model or settings.VLM_MODEL
        self._available = False
        logger.info(f"VLM Provider switched to: {self.provider} (base_url: {self.base_url}, model: {self.model})")

    def _select_best_model(self, available_ids: List[str]) -> str:
        """Select model based on preference, substring match, or best vision model."""
        if not available_ids:
            return self.model

        # 1. Exact match with current self.model
        if self.model in available_ids:
            return self.model

        # 2. Case-insensitive substring match prioritizing known vision models
        preferences = (
            ["llava", "moondream", "bakllava", "qwen"]
            if self.provider == "ollama"
            else ["qwen3", "qwen", "moondream", "smolvlm", "llava"]
        )
        for pref in preferences:
            for a in available_ids:
                if pref in a.lower():
                    return a

        # 3. Filter out non-vision/embedding models
        vision_candidates = [
            a for a in available_ids 
            if not any(non_v in a.lower() for non_v in ["embed", "bge", "bert", "tts", "whisper"])
        ]
        if vision_candidates:
            return vision_candidates[0]

        return available_ids[0]

    async def get_available_models(self) -> List[str]:
        """Fetch all models currently available from active VLM provider REST API."""
        client = self._client
        if client is None:
            client = httpx.AsyncClient(timeout=self.http_timeout)
            self._client = client
        try:
            if self.provider == "ollama":
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    models_list = data.get("models", []) if isinstance(data, dict) else []
                    return [str(m["name"]) for m in models_list if isinstance(m, dict) and m.get("name")]
            else:
                resp = await client.get(f"{self.base_url}/models")
                if resp.status_code == 200:
                    data = resp.json()
                    data_list = data.get("data", []) if isinstance(data, dict) else []
                    return [str(m["id"]) for m in data_list if isinstance(m, dict) and m.get("id")]
        except Exception as e:
            logger.debug(f"Failed to fetch models from {self.provider} at {self.base_url}: {e}")
        return []

    def set_model(self, model_id: str) -> bool:
        """Switch active vision model on the fly."""
        self.model = model_id
        logger.info(f"Active VLM model switched to: {model_id}")
        return True

    @property
    def cached_available(self) -> bool:
        """Cached availability flag refreshed out-of-band by background monitor."""
        return self._cached_available

    async def refresh_availability(self) -> bool:
        """Query VLM provider and update availability cache without blocking frame loop."""
        if not self.enabled:
            self._cached_available = False
            return False
        try:
            available_ids = await self.get_available_models()
            self._cached_available = bool(available_ids)
            if self._cached_available and not self._available:
                self._available = True
                self.model = self._select_best_model(available_ids)
            elif not self._cached_available:
                self._available = False
        except Exception:
            self._cached_available = False
            self._available = False
        return self._cached_available

    async def run_availability_monitor(self, interval_seconds: Optional[int] = None):
        """Background daemon task that periodically checks VLM health without blocking frame loop."""
        interval = interval_seconds or getattr(settings, "VLM_AVAILABILITY_CHECK_INTERVAL_SECONDS", 30)
        while True:
            await self.refresh_availability()
            await asyncio.sleep(interval)

    async def initialize(self):
        if not self.enabled:
            logger.info("VLM disabled in config")
            return
        try:
            self._client = httpx.AsyncClient(timeout=self.http_timeout)
            available_ids = await self.get_available_models()
            if available_ids:
                self._available = True
                self._cached_available = True
                self.model = self._select_best_model(available_ids)
                logger.info(f"VLM ({self.provider}) connected to {self.base_url} (selected model: {self.model}, available: {available_ids})")
            else:
                self._available = False
                self._cached_available = False
                logger.warning(f"VLM ({self.provider}) at {self.base_url} did not return any models")
        except Exception as e:
            logger.warning(f"VLM ({self.provider}) not available at {self.base_url}: {e}")
            self._available = False
            self._cached_available = False

    async def shutdown(self):
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
        if self._client:
            await self._client.aclose()

    async def is_available(self) -> bool:
        if getattr(settings, "VLM_CACHED_AVAILABILITY", False):
            return self._cached_available
        if self._available and self._client is not None:
            return True
        return await self._try_init()

    async def _try_init(self) -> bool:
        """(Re)initialize once, so a late-starting VLM provider is picked up."""
        if not self.enabled:
            return False
        try:
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self.http_timeout)
            available_ids = await self.get_available_models()
            if available_ids:
                self._available = True
                self._cached_available = True
                self.model = self._select_best_model(available_ids)
            else:
                self._available = False
                self._cached_available = False
        except Exception:
            self._available = False
            self._cached_available = False
        return self._available and self._client is not None

    async def _query_ollama(self, client: httpx.AsyncClient, frame_b64: str, prompt: str) -> Optional[str]:
        """Dispatch vision prompt to Ollama's /api/chat endpoint."""
        resp = await client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [frame_b64]
                    }
                ],
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": self.max_tokens
                }
            },
            timeout=self.timeout
        )
        if resp.status_code == 200:
            return resp.json().get("message", {}).get("content", "")
        logger.warning(f"Ollama returned {resp.status_code}: {resp.text[:100]}")
        return None

    async def _query_lm_studio(self, client: httpx.AsyncClient, frame_b64: str, prompt: str) -> Optional[str]:
        """Dispatch vision prompt to LM Studio's OpenAI-compatible /chat/completions endpoint."""
        resp = await client.post(
            f"{self.base_url}/chat/completions",
            json={
                "model": self.model,
                "max_tokens": self.max_tokens,
                "temperature": 0.1,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{frame_b64}"
                                }
                            }
                        ]
                    }
                ]
            },
            timeout=self.timeout
        )
        if resp.status_code == 200:
            return resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        logger.warning(f"LM Studio returned {resp.status_code}")
        return None

    async def analyze_frame(
        self,
        frame_b64: str,
        prompt: Optional[str] = None
    ) -> VLMResult:
        if not await self.is_available() or self._client is None:
            return VLMResult()
        client = self._client
        active_prompt = prompt or self.PROMPT_TEMPLATE

        try:
            t0 = time.time()
            if self.provider == "ollama":
                text = await self._query_ollama(client, frame_b64, active_prompt)
            else:
                text = await self._query_lm_studio(client, frame_b64, active_prompt)

            elapsed = (time.time() - t0) * 1000

            if text is None:
                return VLMResult(inference_time_ms=elapsed)

            return self._parse_response(text, elapsed)

        except httpx.TimeoutException:
            logger.debug(f"VLM ({self.provider}) timeout")
            return VLMResult()
        except Exception as e:
            logger.debug(f"VLM ({self.provider}) error: {e}")
            return VLMResult()

    def _parse_response(self, text: str, elapsed_ms: float) -> VLMResult:
        import json
        try:
            # Extract JSON from response (handling potential markdown code fences)
            start = text.find('{')
            end = text.rfind('}') + 1
            if start >= 0 and end > start:
                parsed = json.loads(text[start:end])

                # 1. Asymmetric Fast-Clean / Deep-Flag format
                if "violation" in parsed:
                    is_viol = bool(parsed.get("violation", False))
                    if not is_viol:
                        return VLMResult(
                            phone_detected=False,
                            cheating_detected=False,
                            talking_detected=False,
                            earbud_detected=False,
                            peeking_detected=False,
                            verdict="FALSE_POSITIVE",
                            quick_reasoning=parsed.get("reason", "Normal exam behavior observed."),
                            description=parsed.get("reason", "All candidates behaving normally."),
                            confidence=0.0,
                            violating_seats=[],
                            raw_response=text,
                            inference_time_ms=elapsed_ms
                        )
                    else:
                        v_type = str(parsed.get("type", "")).upper()
                        reason = str(parsed.get("reason") or parsed.get("description") or "Suspicious exam activity detected.")
                        seat = str(parsed.get("seat", "")).strip()
                        v_seats = [seat] if seat else []
                        conf = float(parsed.get("confidence", 0.9))
                        is_seat = ("SEAT" in v_type or "LEAV" in v_type or "MOV" in v_type or "STAND" in v_type or "VACAT" in v_type or "WALK" in v_type or "LEFT" in v_type)
                        return VLMResult(
                            phone_detected=("PHONE" in v_type or "DEVICE" in v_type),
                            cheating_detected=("CHEAT" in v_type or "NOTE" in v_type or "PAPER" in v_type or "MATERIAL" in v_type or "CHIT" in v_type or "PASS" in v_type or "EXCHANGE" in v_type),
                            talking_detected=("TALK" in v_type or "COMM" in v_type) and not is_seat,
                            earbud_detected=("EARBUD" in v_type or "AUDIO" in v_type or "HEADPHONE" in v_type),
                            peeking_detected=("PEEK" in v_type or "GAZE" in v_type or "LOOK" in v_type),
                            seat_violation_detected=is_seat,
                            verdict="CONFIRMED_VIOLATION",
                            quick_reasoning=reason,
                            description=reason,
                            confidence=conf,
                            violating_seats=v_seats,
                            raw_response=text,
                            inference_time_ms=elapsed_ms
                        )

                # Check for rich multi-frame proctor JSON schema (students & pairs)
                if "students" in parsed or "pairs" in parsed:
                    students = parsed.get("students", [])
                    pairs = parsed.get("pairs", [])
                    needs_review = bool(parsed.get("needs_human_review", False))
                    review_reason = parsed.get("review_reason", "") or parsed.get("observations", "")

                    phone = False
                    cheating = False
                    earbud = False
                    peeking = False
                    talking = False
                    max_conf = 0.0
                    violating_seats = []

                    for s in students:
                        seat_name = s.get("seat", "S1")
                        p_vis = s.get("phone_visible", {})
                        if isinstance(p_vis, dict) and p_vis.get("verdict") == "yes":
                            phone = True
                            if seat_name not in violating_seats:
                                violating_seats.append(seat_name)
                            max_conf = max(max_conf, float(p_vis.get("confidence", 0.9)))
                        h_dev = s.get("hidden_device_behavior", {})
                        if isinstance(h_dev, dict) and h_dev.get("verdict") == "yes":
                            phone = True
                            if seat_name not in violating_seats:
                                violating_seats.append(seat_name)
                            max_conf = max(max_conf, float(h_dev.get("confidence", 0.85)))
                        u_notes = s.get("unauthorized_notes", {})
                        if isinstance(u_notes, dict) and u_notes.get("verdict") == "yes":
                            cheating = True
                            if seat_name not in violating_seats:
                                violating_seats.append(seat_name)
                            max_conf = max(max_conf, float(u_notes.get("confidence", 0.85)))
                        w_audio = s.get("wearable_audio", {})
                        if isinstance(w_audio, dict) and w_audio.get("verdict") == "yes":
                            earbud = True
                            if seat_name not in violating_seats:
                                violating_seats.append(seat_name)
                            max_conf = max(max_conf, float(w_audio.get("confidence", 0.9)))
                        peek = s.get("peeking", {})
                        if isinstance(peek, dict) and peek.get("verdict") == "yes":
                            peeking = True
                            if seat_name not in violating_seats:
                                violating_seats.append(seat_name)
                            max_conf = max(max_conf, float(peek.get("confidence", 0.85)))

                    for p in pairs:
                        pair_seats = p.get("seats", [])
                        pair_str = " & ".join(pair_seats) if isinstance(pair_seats, list) else str(pair_seats)
                        comm = p.get("communication", {})
                        if isinstance(comm, dict) and comm.get("verdict") == "yes":
                            talking = True
                            if pair_str not in violating_seats:
                                violating_seats.append(pair_str)
                            max_conf = max(max_conf, float(comm.get("confidence", 0.85)))
                        p_ex = p.get("paper_exchange", {})
                        if isinstance(p_ex, dict) and p_ex.get("verdict") == "yes":
                            cheating = True
                            if pair_str not in violating_seats:
                                violating_seats.append(pair_str)
                            max_conf = max(max_conf, float(p_ex.get("confidence", 0.9)))
                        m_gaze = p.get("mutual_gaze", {})
                        if isinstance(m_gaze, dict) and m_gaze.get("verdict") == "yes":
                            peeking = True
                            if pair_str not in violating_seats:
                                violating_seats.append(pair_str)
                            max_conf = max(max_conf, float(m_gaze.get("confidence", 0.8)))

                    has_violation = (phone or cheating or earbud or peeking or talking or needs_review)
                    verdict_str = "CONFIRMED_VIOLATION" if has_violation else "FALSE_POSITIVE"

                    return VLMResult(
                        phone_detected=phone,
                        cheating_detected=cheating,
                        talking_detected=talking,
                        earbud_detected=earbud,
                        peeking_detected=peeking,
                        verdict=verdict_str,
                        quick_reasoning=review_reason,
                        description=review_reason or parsed.get("observations", "Multi-frame proctor analysis complete."),
                        confidence=max_conf if has_violation else 0.0,
                        violating_seats=violating_seats,
                        raw_response=text,
                        inference_time_ms=elapsed_ms
                    )

                plausible_val = parsed.get("plausible")
                verdict_val = parsed.get("verdict")
                quick_reas = parsed.get("quick_reasoning") or parsed.get("forensic_reasoning") or parsed.get("answer")

                phone = bool(parsed.get("phone_detected", False))
                cheating = bool(parsed.get("cheating_detected", False))
                talking = bool(parsed.get("talking_detected", False))
                earbud = bool(parsed.get("earbud_detected", False))
                peeking = bool(parsed.get("peeking_detected", False))

                # Handle verdict / plausible overrides
                if verdict_val == "FALSE_POSITIVE" or plausible_val is False:
                    phone = False
                    cheating = False
                    talking = False
                    earbud = False
                    peeking = False
                elif verdict_val == "CONFIRMED_VIOLATION":
                    cheating = True

                conf = float(parsed.get("confidence", 0.8 if (phone or cheating or peeking or earbud or talking or verdict_val == "CONFIRMED_VIOLATION") else 0.0))

                return VLMResult(
                    phone_detected=phone,
                    cheating_detected=cheating,
                    suspicious_text=bool(parsed.get("suspicious_text", False)),
                    talking_detected=talking,
                    earbud_detected=earbud,
                    peeking_detected=peeking,
                    plausible=plausible_val,
                    verdict=verdict_val,
                    quick_reasoning=str(quick_reas) if quick_reas else None,
                    visibility=parsed.get("visibility"),
                    detected_objects=parsed.get("detected_objects", []),
                    description=str(parsed.get("description", quick_reas or "")),
                    confidence=conf,
                    raw_response=text,
                    inference_time_ms=elapsed_ms
                )
        except (json.JSONDecodeError, ValueError):
            pass

        # Safe fallback: only flag on strict machine-readable affirmative keys, never loose English words
        lower = text.lower()
        phone_found = '"phone_detected": true' in lower or '"type": "phone"' in lower
        cheat_found = '"cheating_detected": true' in lower or '"type": "cheat' in lower or '"type": "unauthorized' in lower or '"type": "chit' in lower or '"type": "pass' in lower
        seat_found = '"seat_violation_detected": true' in lower or '"type": "seat' in lower or '"type": "leav' in lower or '"type": "mov' in lower or '"type": "stand' in lower or '"type": "vacat' in lower
        talking_found = ('"talking_detected": true' in lower or '"type": "talk' in lower or '"type": "comm' in lower) and not seat_found
        earbud_found = '"earbud_detected": true' in lower or '"type": "earbud' in lower or '"type": "audio' in lower
        peeking_found = '"peeking_detected": true' in lower or '"type": "peek' in lower

        has_flag = (phone_found or cheat_found or earbud_found or talking_found or peeking_found or seat_found)

        return VLMResult(
            phone_detected=phone_found,
            cheating_detected=cheat_found,
            suspicious_text=False,
            talking_detected=talking_found,
            earbud_detected=earbud_found,
            peeking_detected=peeking_found,
            seat_violation_detected=seat_found,
            detected_objects=[],
            description=text[:200].strip() if has_flag else "Normal exam conduct observed.",
            confidence=0.85 if has_flag else 0.0,
            verdict="CONFIRMED_VIOLATION" if has_flag else "FALSE_POSITIVE",
            raw_response=text,
            inference_time_ms=elapsed_ms
        )

    async def analyze_image_file(self, file_path: str, prompt: Optional[str] = None) -> VLMResult:
        """Analyze an image file asynchronously by encoding to base64."""
        if not os.path.isfile(file_path):
            logger.warning(f"VLM image file not found: {file_path}")
            return VLMResult()
        try:
            with open(file_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return await self.analyze_frame(b64, prompt=prompt)
        except Exception as e:
            logger.warning(f"Failed to read image for VLM: {e}")
            return VLMResult()

    def analyze_image_file_sync(self, file_path: str, prompt: Optional[str] = None) -> VLMResult:
        """Synchronously analyze an image file (useful for background worker threads)."""
        if not self.enabled or not os.path.isfile(file_path):
            return VLMResult()
        try:
            with open(file_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")

            active_prompt = prompt or self.PROMPT_TEMPLATE
            t0 = time.time()

            with httpx.Client(timeout=self.timeout) as client:
                if self.provider == "ollama":
                    resp = client.post(
                        f"{self.base_url}/api/chat",
                        json={
                            "model": self.model,
                            "messages": [
                                {
                                    "role": "user",
                                    "content": active_prompt,
                                    "images": [b64]
                                }
                            ],
                            "stream": False,
                            "options": {
                                "temperature": 0.1,
                                "num_predict": self.max_tokens
                            }
                        }
                    )
                    elapsed = (time.time() - t0) * 1000
                    if resp.status_code == 200:
                        text = resp.json().get("message", {}).get("content", "")
                        return self._parse_response(text, elapsed)
                    return VLMResult(inference_time_ms=elapsed)
                else:
                    resp = client.post(
                        f"{self.base_url}/chat/completions",
                        json={
                            "model": self.model,
                            "max_tokens": self.max_tokens,
                            "temperature": 0.1,
                            "messages": [
                                {
                                    "role": "user",
                                    "content": [
                                        {"type": "text", "text": active_prompt},
                                        {
                                            "type": "image_url",
                                            "image_url": {
                                                "url": f"data:image/jpeg;base64,{b64}"
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    )
                    elapsed = (time.time() - t0) * 1000
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        return self._parse_response(text, elapsed)
                    return VLMResult(inference_time_ms=elapsed)
        except Exception as e:
            logger.debug(f"VLM sync error: {e}")
            return VLMResult()


# Aliasing for semantic clarity
UnifiedVLMClient = LMStudioVLM
_vlm_client_singleton: Optional[LMStudioVLM] = None


def get_vlm_client() -> LMStudioVLM:
    global _vlm_client_singleton
    if _vlm_client_singleton is None:
        _vlm_client_singleton = LMStudioVLM()
    return _vlm_client_singleton
