import asyncio
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pipeline import local_ollama_url, run_pipeline
from session import register, cancel, cleanup_done
from state import get_state, set_state, remove_state
from stt import _load_model as load_stt
from tts import _load_piper as load_tts


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
    }


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
