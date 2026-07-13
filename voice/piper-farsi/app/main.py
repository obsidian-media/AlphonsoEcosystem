from __future__ import annotations

import io
import os
import wave
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Response
from huggingface_hub import hf_hub_download
from pydantic import BaseModel, StringConstraints
from piper import PiperVoice
from typing_extensions import Annotated

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]


@dataclass(frozen=True)
class VoiceSource:
    repo_id: str
    model_file: str
    config_file: str


VOICES = {
    "mana": VoiceSource("MahtaFetrat/Mana-Persian-Piper", "fa_IR-mana-medium.onnx", "fa_IR-mana-medium.onnx.json"),
    "manta": VoiceSource("kiarashQ/fa-ir-tts-piper-ar-mantatts-v1", "model.onnx", "config.json"),
}

DATA_DIR = Path(os.environ.get("PIPER_DATA_DIR", "/data/piper"))
SERVICE_TOKEN = os.environ.get("PIPER_SERVICE_TOKEN", "").strip()
_loaded_voices: dict[str, PiperVoice] = {}

app = FastAPI(title="Alphonso Piper Farsi")


class SynthesisRequest(BaseModel):
    text: Text
    voice: str = "mana"


def require_service_token(authorization: str | None) -> None:
    if not SERVICE_TOKEN or authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def load_voice(voice_id: str) -> PiperVoice:
    if voice_id not in VOICES:
        raise HTTPException(status_code=422, detail="Unsupported Farsi voice")
    if voice_id not in _loaded_voices:
        source = VOICES[voice_id]
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        model_path = hf_hub_download(source.repo_id, source.model_file, local_dir=DATA_DIR / voice_id)
        hf_hub_download(source.repo_id, source.config_file, local_dir=DATA_DIR / voice_id)
        _loaded_voices[voice_id] = PiperVoice.load(model_path)
    return _loaded_voices[voice_id]


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "voices": sorted(VOICES)}


@app.post("/v1/synthesize")
async def synthesize(payload: SynthesisRequest, authorization: str | None = Header(default=None)):
    require_service_token(authorization)
    wav = io.BytesIO()
    with wave.open(wav, "wb") as wav_file:
        load_voice(payload.voice).synthesize_wav(payload.text, wav_file)
    return Response(content=wav.getvalue(), media_type="audio/wav")
