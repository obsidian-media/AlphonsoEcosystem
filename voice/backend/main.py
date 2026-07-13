import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline import local_ollama_url, generate_voice_reply, run_pipeline
from session import register, cancel, cleanup_done
from state import get_state, set_state, remove_state
from stt import _load_model as load_stt
from tts import _load_piper as load_tts, describe_nvidia_tts_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload models at startup so first request isn't slow
    load_stt()
    load_tts()
    yield
    cleanup_done()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VoiceRequest(BaseModel):
    session_id: str = Field(default="anon")
    text: str
    history: list[dict[str, Any]] = Field(default_factory=list)
    tts_model: str = Field(default="magpie")
    language: str = Field(default="en-US")


class VoiceResponse(BaseModel):
    session_id: str
    agent: str
    reply: str
    audio_base64: str
    tts_model: str = "magpie"
    language: str = "en-US"
    state: str = "idle"


ALLOWED_TTS_MODELS = {"magpie", "chatterbox"}


def _check_cloud_auth(authorization: str | None) -> None:
    required_key = os.environ.get("VOICE_CLOUD_API_KEY", "").strip()
    if not required_key:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing voice cloud auth token")
    token = authorization.split(" ", 1)[1].strip()
    if token != required_key:
        raise HTTPException(status_code=403, detail="Invalid voice cloud auth token")


@app.get("/health")
async def health():
    tts_ok = False
    try:
        import os
        from pathlib import Path
        model_path = Path(__file__).parent / "en_US-lessac-medium.onnx"
        tts_ok = model_path.exists()
    except Exception:
        pass
    ollama_reachable = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(local_ollama_url().removesuffix("/api/chat") + "/api/tags")
            ollama_reachable = response.is_success
    except Exception:
        pass
    return {
        "status": "ok",
        "stt": True,
        "tts": tts_ok,
        "ollama": {"url": local_ollama_url(), "reachable": ollama_reachable},
        "cloud_tts": describe_nvidia_tts_models(),
    }


@app.post("/voice/respond", response_model=VoiceResponse)
async def voice_respond(payload: VoiceRequest, authorization: str | None = Header(default=None)):
    _check_cloud_auth(authorization)

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    tts_model = payload.tts_model.strip().lower()
    if tts_model not in ALLOWED_TTS_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported TTS model")

    session_id = payload.session_id or "anon"
    set_state(session_id, "thinking")

    reply = ""
    agent = "alphonso_core"
    audio_base64 = ""
    used_tts_model = tts_model
    used_language = payload.language.strip() or "en-US"

    async for event in generate_voice_reply(session_id, text, payload.history, tts_model, used_language):
        etype = event.get("type")
        if etype == "agent":
            agent = event.get("value", agent)
        elif etype == "voice_response":
            reply = event.get("reply", "")
            audio_base64 = event.get("audio_base64", "")
            used_tts_model = event.get("tts_model", used_tts_model)
            used_language = event.get("language", used_language)
        elif etype == "state":
            set_state(session_id, event.get("value", "idle"))

    if not reply:
        raise HTTPException(status_code=502, detail="Voice backend returned no reply")
    if not audio_base64:
        raise HTTPException(status_code=502, detail="Voice backend returned no audio")

    return VoiceResponse(
        session_id=session_id,
        agent=agent,
        reply=reply,
        audio_base64=audio_base64,
        tts_model=used_tts_model,
        language=used_language,
        state=str(get_state(session_id)),
    )


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    session_id = ws.headers.get("x-session", "anon")
    set_state(session_id, "idle")

    buffer = bytearray()
    conversation_history: list[dict] = []

    async def process(pcm: bytes) -> None:
        async for event in run_pipeline(session_id, pcm, conversation_history):
            etype = event.get("type")
            try:
                if etype == "tts":
                    await ws.send_bytes(event["audio"])
                else:
                    await ws.send_json(event)
            except Exception:
                return

            if etype == "state":
                set_state(session_id, event["value"])

            if etype == "stt":
                conversation_history.append({"role": "user", "content": event["text"]})

            if etype == "llm" and event.get("done"):
                reply = event.get("full_reply", "")
                if reply:
                    conversation_history.append({"role": "assistant", "content": reply})
                if len(conversation_history) > 20:
                    conversation_history[:] = conversation_history[-20:]

    try:
        while True:
            msg = await ws.receive()

            if "bytes" in msg:
                # Barge-in: cancel current task when assistant is speaking
                if get_state(session_id) == "speaking":
                    cancel(session_id)
                    set_state(session_id, "idle")
                    buffer = bytearray()

                buffer.extend(msg["bytes"])

                if len(buffer) >= 24000:  # ~1.5s of 16kHz 16-bit mono PCM
                    data = bytes(buffer)
                    buffer = bytearray()
                    task = asyncio.create_task(process(data))
                    register(session_id, task)

            elif "text" in msg:
                try:
                    ctrl = json.loads(msg["text"])
                    if ctrl.get("type") == "reset":
                        cancel(session_id)
                        conversation_history.clear()
                        buffer = bytearray()
                        set_state(session_id, "idle")
                        await ws.send_json({"type": "state", "value": "idle"})
                except Exception:
                    pass

    except WebSocketDisconnect:
        cancel(session_id)
        remove_state(session_id)
        cleanup_done()
