import numpy as np
from faster_whisper import WhisperModel
from functools import lru_cache


@lru_cache(maxsize=1)
def _load_model() -> WhisperModel:
    return WhisperModel("tiny.en", device="cpu", compute_type="int8")


def transcribe(pcm: bytes) -> str:
    """Transcribe raw 16-bit 16kHz mono PCM bytes to text using faster-whisper."""
    model = _load_model()
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = model.transcribe(audio, language="en", beam_size=1)
    return " ".join(seg.text.strip() for seg in segments).strip()
