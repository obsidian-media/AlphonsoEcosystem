import os

import numpy as np
from faster_whisper import WhisperModel
from functools import lru_cache

# Speech recognition settings, passed in by the launcher (QA 2026-10-22: they
# were fixed). Defaults: the small English model, English.
DEFAULT_STT_MODEL = "tiny.en"


def stt_model_name() -> str:
    return (os.environ.get("VOICE_STT_MODEL") or DEFAULT_STT_MODEL).strip()


def stt_language():
    """The spoken language, or None to detect it ("auto"). English-only models stay English."""
    lang = (os.environ.get("VOICE_STT_LANGUAGE") or "en").strip().lower()
    if stt_model_name().endswith(".en"):
        return "en"
    return None if lang in ("", "auto") else lang


@lru_cache(maxsize=1)
def _load_model() -> WhisperModel:
    return WhisperModel(stt_model_name(), device="cpu", compute_type="int8")


def transcribe(pcm: bytes) -> str:
    """Transcribe raw 16-bit 16kHz mono PCM bytes to text using faster-whisper."""
    model = _load_model()
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = model.transcribe(audio, language=stt_language(), beam_size=1)
    return " ".join(seg.text.strip() for seg in segments).strip()
