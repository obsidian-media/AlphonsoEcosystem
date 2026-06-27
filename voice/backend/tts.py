import asyncio
import io
import wave
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=2)


@lru_cache(maxsize=1)
def _load_piper():
    from piper import PiperVoice
    import os
    from pathlib import Path
    model_path = Path(__file__).parent / "en_US-lessac-medium.onnx"
    if not model_path.exists():
        import logging
        logging.warning(
            "Piper voice model not found. Run: python -c \"import piper; piper.download_model('en_US-lessac-medium')\""
        )
        return None
    return PiperVoice.load("en_US-lessac-medium")


def _synthesize_sync(text: str) -> bytes:
    voice = _load_piper()
    if voice is None:
        return b""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        voice.synthesize(text, wf)
    return buf.getvalue()


async def synthesize(text: str) -> bytes:
    """Synthesize text to WAV bytes using Piper TTS (non-blocking)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _synthesize_sync, text)
