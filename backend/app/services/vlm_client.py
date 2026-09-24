import os
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
    plausible: Optional[bool] = None
    verdict: Optional[str] = None
    quick_reasoning: Optional[str] = None
    visibility: Optional[str] = None
    detected_objects: List[str] = field(default_factory=list)
    description: str = ""
    confidence: float = 0.0
    raw_response: str = ""
    inference_time_ms: float = 0.0


def build_instant_surety_prompt(candidate_category: str, cv_confidence: float = 0.85, bbox: Optional[dict] = None) -> str:
    """Tier 1A Support: Instant Surety Check Prompt to fast-clear CV false positives."""
    bbox_line = ""
    if bbox:
        bbox_line = (
            f"The CV detector flagged a region roughly at normalized coordinates "
            f"x={bbox.get('x', 0):.2f}, y={bbox.get('y', 0):.2f}, w={bbox.get('w', 0):.2f}, h={bbox.get('h', 0):.2f} — "
            "pay closest attention there, but consider the full frame.\n"
        )
    return (
        "You are a fast automatic verification pass on a computer-vision (YOLOv8/MediaPipe) detection "
        "from a live exam surveillance feed. The CV detector is fast but geometry-based and prone to "
        "specific false positives (e.g. mistaking a pen/ruler for a phone, or ear-touching for an earbud). "
        "Your job is a QUICK confirm/deny check, not a full forensic review.\n"
        "\n"
        f"CV candidate category: {candidate_category}\n"
        f"CV confidence: {cv_confidence:.2f}\n"
        f"{bbox_line}"
        "\n"
        "Quick rule check:\n"
        "- Pens/pencils/erasers/rulers/calculators are NOT phones.\n"
        "- Touching/scratching the ear, adjusting glasses/mask/headwear, or hearing aids/cochlear implants are NOT earbuds.\n"
        "- Looking at own paper, writing, or brief incidental glances are NOT peeking.\n"
        "- If genuinely unclear from this single frame, say so — do not guess.\n"
        "\n"
        "Return ONLY a raw JSON object:\n"
        "{\n"
        '  "phone_detected": boolean,\n'
        '  "cheating_detected": boolean,\n'
        '  "talking_detected": boolean,\n'
        '  "earbud_detected": boolean,\n'
        '  "peeking_detected": boolean,\n'
        '  "plausible": boolean,\n'
        '  "confidence": float between 0.0 and 1.0,\n'
        '  "visibility": "clear" | "partial" | "obstructed",\n'
        '  "quick_reasoning": "1 short sentence justifying verdict"\n'
        "}"
    )


def build_forensic_reanalysis_prompt(event_type: str, description: str) -> str:
    """Tier 2: Single-Frame Forensic Re-Analysis Prompt."""
    return (
        "You are an independent AI forensic reviewer conducting a SECOND-OPINION verification of a previously "
        "flagged exam anomaly. Your job is to look at this image freshly and form your own conclusion — you "
        "are checking the original detection's work, not confirming it.\n"
        "\n"
        "STEP 1 — Independent observation:\n"
        "Describe exactly what you see regarding the candidate's hands, desk surface, lap, ears, and gaze "
        "direction. Note object shapes, positions, and any ambiguity.\n"
        "\n"
        "STEP 2 — Prior detection to verify (reference only, not ground truth):\n"
        f"- Flagged category: {event_type}\n"
        f"- Original system description: {description}\n"
        "\n"
        "STEP 3 — Apply standing rules:\n"
        "- Holding a pen, pencil, eraser, ruler, or calculator is NOT a phone.\n"
        "- Looking down at own paper is NOT peeking.\n"
        "- Touching hair/face, resting chin on hand is NOT a hidden earbud.\n"
        "\n"
        "Return ONLY a raw JSON object:\n"
        "{\n"
        '  "phone_detected": boolean,\n'
        '  "cheating_detected": boolean,\n'
        '  "talking_detected": boolean,\n'
        '  "earbud_detected": boolean,\n'
        '  "peeking_detected": boolean,\n'
        '  "verdict": "CONFIRMED_VIOLATION" | "FALSE_POSITIVE" | "INCONCLUSIVE",\n'
        '  "confidence": float between 0.0 and 1.0,\n'
        '  "forensic_reasoning": "detailed breakdown",\n'
        '  "detected_objects": ["pen", "paper", ...]\n'
        "}"
    )


def build_custom_query_prompt(custom_question: str) -> str:
    """Interactive Custom Proctor Query Prompt."""
    return (
        "You are an independent AI forensic reviewer. An invigilator has asked a specific question about "
        "this exam surveillance snapshot:\n"
        f"Question: {custom_question}\n"
        "\n"
        "Answer only based on what is visibly verifiable in the image. Writing/reading own paper is normal; "
        "pens/rulers/calculators are not phones; occluded views should be reported as such.\n"
        "\n"
        "Return ONLY a raw JSON object:\n"
        "{\n"
        '  "answer": "direct, concise answer to the question",\n'
        '  "confidence": float between 0.0 and 1.0,\n'
        '  "supporting_observation": "what in the image supports this answer",\n'
        '  "visibility": "clear" | "partial" | "obstructed"\n'
        "}"
    )


class LMStudioVLM:
    """Vision Language Model client supporting both LM Studio and Ollama (LLaVA / Moondream / Qwen)."""

    PROMPT_TEMPLATE = (
        "You are an AI exam proctor analyzing a surveillance snapshot of a student at an exam desk.\n"
        "Inspect the image for these suspicious indicators:\n"
        "1. MOBILE_PHONE: Person holding, using, or looking at a mobile phone or glowing screen.\n"
        "2. UNAUTHORIZED_NOTES: Loose cheat sheets, unauthorized paper slips, or notes concealed under desk/lap.\n"
        "3. WEARABLE_AUDIO: In-ear earbuds, headphones, or bluetooth earpiece visible on either ear.\n"
        "4. COMMUNICATION: Actively turning and speaking or gesturing to another person.\n"
        "5. PEEKING_AT_NEIGHBOR: Person turning head or leaning sideways to look at an adjacent candidate's exam desk or paper.\n"
        "\n"
        "CRITICAL RULES:\n"
        "- Writing on an exam paper on the desk with a pen/pencil is NORMAL behavior, NOT cheating.\n"
        "- Looking down directly at the exam paper on the desk is NORMAL behavior.\n"
        "\n"
        "Return ONLY a raw JSON object matching this schema:\n"
        "{\n"
        '  "phone_detected": boolean,\n'
        '  "cheating_detected": boolean,\n'
        '  "talking_detected": boolean,\n'
        '  "earbud_detected": boolean,\n'
        '  "peeking_detected": boolean,\n'
        '  "detected_objects": ["desk", "paper", "pen", ...],\n'
        '  "description": "1 brief sentence summarizing visible student activity",\n'
        '  "confidence": float between 0.0 and 1.0\n'
        "}"
    )

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
        self.enabled = settings.VLM_ENABLED
        self._client: Optional[httpx.AsyncClient] = None
        self._available = False

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
        if not self._client:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        try:
            if self.provider == "ollama":
                resp = await self._client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    return [m.get("name") for m in data.get("models", []) if m.get("name")]
            else:
                resp = await self._client.get(f"{self.base_url}/models")
                if resp.status_code == 200:
                    data = resp.json()
                    return [m.get("id") for m in data.get("data", []) if m.get("id")]
        except Exception as e:
            logger.debug(f"Failed to fetch models from {self.provider} at {self.base_url}: {e}")
        return []

    def set_model(self, model_id: str) -> bool:
        """Switch active vision model on the fly."""
        self.model = model_id
        logger.info(f"Active VLM model switched to: {model_id}")
        return True

    async def initialize(self):
        if not self.enabled:
            logger.info("VLM disabled in config")
            return
        try:
            self._client = httpx.AsyncClient(timeout=self.timeout)
            available_ids = await self.get_available_models()
            if available_ids:
                self._available = True
                self.model = self._select_best_model(available_ids)
                logger.info(f"VLM ({self.provider}) connected to {self.base_url} (selected model: {self.model}, available: {available_ids})")
            else:
                self._available = False
                logger.warning(f"VLM ({self.provider}) at {self.base_url} did not return any models")
        except Exception as e:
            logger.warning(f"VLM ({self.provider}) not available at {self.base_url}: {e}")
            self._available = False

    async def shutdown(self):
        if self._client:
            await self._client.aclose()

    async def is_available(self) -> bool:
        if self._available and self._client is not None:
            return True
        return await self._try_init()

    async def _try_init(self) -> bool:
        """(Re)initialize once, so a late-starting VLM provider is picked up."""
        if not self.enabled:
            return False
        try:
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self.timeout)
            available_ids = await self.get_available_models()
            if available_ids:
                self._available = True
                self.model = self._select_best_model(available_ids)
            else:
                self._available = False
        except Exception:
            self._available = False
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
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{frame_b64}"
                                }
                            },
                            {"type": "text", "text": prompt}
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

        # Safe fallback: only flag if explicit keywords are present (avoid false positives on 'paper' or 'desk')
        lower = text.lower()
        phone_found = "phone_detected\": true" in lower or ("holding a phone" in lower or "using a phone" in lower)
        cheat_found = "cheating_detected\": true" in lower or ("cheat sheet" in lower or "hidden notes" in lower)
        earbud_found = "earbud_detected\": true" in lower or ("wearing earbuds" in lower or "wearing headphones" in lower)
        talking_found = "talking_detected\": true" in lower or ("talking to" in lower or "speaking to" in lower)
        peeking_found = "peeking_detected\": true" in lower or ("peeking" in lower or "looking at neighbor" in lower or "turning head to look at" in lower)

        return VLMResult(
            phone_detected=phone_found,
            cheating_detected=cheat_found,
            suspicious_text=False,
            talking_detected=talking_found,
            earbud_detected=earbud_found,
            peeking_detected=peeking_found,
            detected_objects=[],
            description=text[:200].strip(),
            confidence=0.8 if (phone_found or cheat_found or earbud_found or peeking_found) else 0.0,
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
                                    "content": prompt,
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
                                        {
                                            "type": "image_url",
                                            "image_url": {
                                                "url": f"data:image/jpeg;base64,{b64}"
                                            }
                                        },
                                        {"type": "text", "text": prompt}
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
