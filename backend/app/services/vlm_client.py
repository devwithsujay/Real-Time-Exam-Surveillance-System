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
    detected_objects: List[str] = field(default_factory=list)
    description: str = ""
    confidence: float = 0.0
    raw_response: str = ""
    inference_time_ms: float = 0.0


class LMStudioVLM:
    """Vision Language Model client using LM Studio's OpenAI-compatible API."""

    def __init__(self):
        self.base_url = settings.VLM_BASE_URL
        self.model = settings.VLM_MODEL
        self.max_tokens = settings.VLM_MAX_TOKENS
        self.timeout = settings.VLM_TIMEOUT
        self.enabled = settings.VLM_ENABLED
        self._client: Optional[httpx.AsyncClient] = None
        self._available = False

    def _select_best_model(self, available_ids: List[str]) -> str:
        """Select model based on preference, substring match, or best vision model."""
        if not available_ids:
            return self.model

        # 1. Exact match with current self.model or settings.VLM_MODEL
        candidates = [self.model, settings.VLM_MODEL, "qwen/qwen3-vl-4b"]
        for c in candidates:
            if c and c in available_ids:
                return c

        # 2. Case-insensitive substring match prioritizing qwen
        for pref in ["qwen3", "qwen", "moondream", "smolvlm"]:
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
        """Fetch all models currently available from LM Studio REST API."""
        if not self._client:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        try:
            resp = await self._client.get(f"{self.base_url}/models")
            if resp.status_code == 200:
                data = resp.json()
                return [m.get("id") for m in data.get("data", []) if m.get("id")]
        except Exception as e:
            logger.debug(f"Failed to fetch models from {self.base_url}: {e}")
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
            resp = await self._client.get(f"{self.base_url}/models")
            if resp.status_code == 200:
                self._available = True
                data = resp.json()
                available_ids = [m.get("id") for m in data.get("data", []) if m.get("id")]
                self.model = self._select_best_model(available_ids)
                logger.info(f"VLM connected to {self.base_url} (selected model: {self.model}, available: {available_ids})")
            else:
                logger.warning(f"VLM at {self.base_url} returned {resp.status_code}")
        except Exception as e:
            logger.warning(f"VLM not available at {self.base_url}: {e}")
            self._available = False

    async def shutdown(self):
        if self._client:
            await self._client.aclose()

    async def is_available(self) -> bool:
        if self._available and self._client is not None:
            return True
        return await self._try_init()

    async def _try_init(self) -> bool:
        """(Re)initialize once, so a late-starting LM Studio is picked up."""
        if not self.enabled:
            return False
        try:
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self.timeout)
            resp = await self._client.get(f"{self.base_url}/models")
            if resp.status_code == 200:
                self._available = True
                data = resp.json()
                available_ids = [m.get("id") for m in data.get("data", []) if m.get("id")]
                self.model = self._select_best_model(available_ids)
            else:
                self._available = False
        except Exception:
            self._available = False
        return self._available and self._client is not None

    async def analyze_frame(
        self,
        frame_b64: str,
    ) -> VLMResult:
        if not await self.is_available() or self._client is None:
            return VLMResult()
        client = self._client

        prompt = (
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

        try:
            t0 = time.time()
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
            elapsed = (time.time() - t0) * 1000

            if resp.status_code != 200:
                logger.warning(f"VLM returned {resp.status_code}")
                return VLMResult(inference_time_ms=elapsed)

            data = resp.json()
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return self._parse_response(text, elapsed)

        except httpx.TimeoutException:
            logger.debug("VLM timeout")
            return VLMResult()
        except Exception as e:
            logger.debug(f"VLM error: {e}")
            return VLMResult()

    def _parse_response(self, text: str, elapsed_ms: float) -> VLMResult:
        import json
        try:
            # Extract JSON from response (handling potential markdown code fences)
            start = text.find('{')
            end = text.rfind('}') + 1
            if start >= 0 and end > start:
                parsed = json.loads(text[start:end])
                return VLMResult(
                    phone_detected=bool(parsed.get("phone_detected", False)),
                    cheating_detected=bool(parsed.get("cheating_detected", False)),
                    suspicious_text=bool(parsed.get("suspicious_text", False)),
                    talking_detected=bool(parsed.get("talking_detected", False)),
                    earbud_detected=bool(parsed.get("earbud_detected", False)),
                    peeking_detected=bool(parsed.get("peeking_detected", False)),
                    detected_objects=parsed.get("detected_objects", []),
                    description=str(parsed.get("description", "")),
                    confidence=float(parsed.get("confidence", 0.8 if (parsed.get("phone_detected") or parsed.get("cheating_detected") or parsed.get("peeking_detected")) else 0.0)),
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

    async def analyze_image_file(self, file_path: str) -> VLMResult:
        """Analyze an image file asynchronously by encoding to base64."""
        if not os.path.isfile(file_path):
            logger.warning(f"VLM image file not found: {file_path}")
            return VLMResult()
        try:
            with open(file_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return await self.analyze_frame(b64)
        except Exception as e:
            logger.warning(f"Failed to read image for VLM: {e}")
            return VLMResult()

    def analyze_image_file_sync(self, file_path: str) -> VLMResult:
        """Synchronously analyze an image file (useful for background worker threads)."""
        if not self.enabled or not os.path.isfile(file_path):
            return VLMResult()
        try:
            with open(file_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")

            prompt = (
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
            t0 = time.time()
            with httpx.Client(timeout=self.timeout) as client:
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


_vlm_client_singleton: Optional[LMStudioVLM] = None


def get_vlm_client() -> LMStudioVLM:
    global _vlm_client_singleton
    if _vlm_client_singleton is None:
        _vlm_client_singleton = LMStudioVLM()
    return _vlm_client_singleton
