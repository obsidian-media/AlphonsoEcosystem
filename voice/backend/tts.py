import asyncio
import io
import logging
import os
import wave
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

_executor = ThreadPoolExecutor(max_workers=2)
_VOICE_MODEL = "en_US-lessac-medium.onnx"


def _model_path() -> Path:
    """Use the Runtime Hub model directory when present, otherwise bundled assets."""
    model_dir = Path(os.environ.get("VOICE_PIPER_MODEL_DIR", Path(__file__).parent))
    return model_dir / _VOICE_MODEL


@lru_cache(maxsize=1)
def _load_piper():
    from piper import PiperVoice

    model_path = _model_path()
    if not model_path.exists():
        logging.error(
            "Piper voice model is missing — voice replies will be silent. "
            "Provision it explicitly with: python -m piper.download_voices "
            "--data-dir %s en_US-lessac-medium",
            model_path.parent,
        )
        return None

    return PiperVoice.load(str(model_path))


def _synthesize_sync(text: str) -> bytes:
    voice = _load_piper()
    if voice is None:
        return b""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        voice.synthesize_wav(text, wf)
    return buf.getvalue()


async def synthesize(text: str) -> bytes:
    """Synthesize text to WAV bytes using Piper TTS (non-blocking)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, _synthesize_sync, text)
