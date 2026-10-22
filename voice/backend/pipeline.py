import json
import os
import httpx

from stt import transcribe
from tts import synthesize
from router import detect_agent
from vad import is_speech

# The model is the one chosen in Alphonso (passed in by the launcher as
# VOICE_OLLAMA_MODEL). QA 2026-10-22: it was fixed at "llama3.2", which a fresh
# install (starter model llama3.2:3b) may not have.
DEFAULT_MODEL = "llama3.2:3b"


def ollama_model() -> str:
    return (os.environ.get("VOICE_OLLAMA_MODEL") or DEFAULT_MODEL).strip()


def local_ollama_url() -> str:
    """Return the local or LAN Ollama endpoint used by the Local Voice Gateway."""
    return os.environ.get("LOCAL_OLLAMA_URL", "http://localhost:11434/api/chat").strip()


async def _call_ollama(session_id, text, agent, history, model=None):
    """Stream a reply from Ollama's /api/chat, yielding text chunks as they arrive.

    ``model`` comes from the app's config message (the user's choice in
    Alphonso). The address is only ever the launcher's LOCAL_OLLAMA_URL: it is
    never taken from the connection, so a client cannot make Voice OS send
    requests to an address of its choosing (CodeQL, 2026-10-22).
    """
    messages = [*history, {"role": "user", "content": text}]
    payload = {"model": model or ollama_model(), "messages": messages, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", local_ollama_url(), json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        yield chunk
                    if data.get("done"):
                        break
    except Exception as error:
        yield f"[Voice OS could not reach Ollama: {error}]"


async def run_pipeline(session_id, pcm, history, model=None):
    if not is_speech(pcm):
        return

    text = transcribe(pcm)
    if not text:
        return

    yield {'type': 'stt', 'text': text}

    agent = detect_agent(text)
    yield {'type': 'agent', 'value': agent}

    yield {'type': 'state', 'value': 'thinking'}

    full_reply = ""
    async for chunk in _call_ollama(session_id, text, agent, history, model=model):
        full_reply += chunk
        yield {'type': 'llm', 'text': chunk}

    yield {'type': 'llm', 'text': '', 'done': True, 'full_reply': full_reply}

    yield {'type': 'state', 'value': 'speaking'}

    audio = await synthesize(full_reply)

    yield {'type': 'tts', 'audio': audio}

    yield {'type': 'state', 'value': 'idle'}
