from __future__ import annotations

import base64
import time
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException

from app.auth import require_bearer_token
from app.azure_tts import AzureTTSClient
from app.config import Settings
from app.contracts import ChatMessage, Timings, VoiceRequest, VoiceResponse
from app.nvidia import NvidiaClient, NvidiaError
from app.voice_policy import VoicePolicyError, build_system_message

app = FastAPI(title="Alphonso Cloud Voice")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, object]:
    status = Settings.from_env().public_status()
    if not status["ready"]:
        raise HTTPException(status_code=503, detail=status)
    return status


@app.post("/v1/voice/respond", response_model=VoiceResponse)
async def respond(payload: VoiceRequest, authorization: str | None = Header(default=None)) -> VoiceResponse:
    settings = Settings.from_env()
    require_bearer_token(authorization, settings.voice_cloud_api_key)
    if not settings.is_ready:
        raise HTTPException(status_code=503, detail="Cloud voice service is not configured")
    client = NvidiaClient(settings)
    started = time.perf_counter()
    try:
        messages = [
            {"role": "system", "content": build_system_message(payload.agent_id, payload.language)},
            *[message.model_dump() for message in payload.history],
            ChatMessage(role="user", content=payload.text).model_dump(),
        ]
        reply = await client.complete(messages)
        llm_ms = int((time.perf_counter() - started) * 1000)
        if payload.language == "fa-IR":
            audio = await AzureTTSClient(settings).synthesize(reply)
            tts_provider = "azure"
        else:
            audio = await client.synthesize(reply, payload.language, payload.tts_model)
            tts_provider = "nvidia"
    except (NvidiaError, VoicePolicyError) as error:
        raise HTTPException(status_code=error.status_code, detail=error.safe_message) from error
    total_ms = int((time.perf_counter() - started) * 1000)
    return VoiceResponse(request_id=str(uuid4()), session_id=payload.session_id, agent=payload.agent_id, reply=reply, audio_base64=base64.b64encode(audio).decode("ascii"), tts_model=payload.tts_model, tts_provider=tts_provider, language=payload.language, timings_ms=Timings(llm=llm_ms, tts=total_ms - llm_ms, total=total_ms))
