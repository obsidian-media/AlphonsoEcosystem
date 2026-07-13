import json
import base64
import os
import httpx

from stt import transcribe
from tts import synthesize, synthesize_nvidia
from router import detect_agent
from vad import is_speech

DEFAULT_MODEL = "llama3.2"


def local_ollama_url() -> str:
    """Return the local or LAN Ollama endpoint used by the Local Voice Gateway."""
    return os.environ.get("LOCAL_OLLAMA_URL", "http://localhost:11434/api/chat").strip()


async def _call_ollama(session_id, text, agent, history):
    """Stream a reply from Ollama's /api/chat, yielding text chunks as they arrive."""
    messages = [*history, {"role": "user", "content": text}]
    payload = {"model": DEFAULT_MODEL, "messages": messages, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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


async def run_pipeline(session_id, pcm, history):
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
    async for chunk in _call_ollama(session_id, text, agent, history):
        full_reply += chunk
        yield {'type': 'llm', 'text': chunk}

    yield {'type': 'llm', 'text': '', 'done': True, 'full_reply': full_reply}

    yield {'type': 'state', 'value': 'speaking'}

    audio = await synthesize(full_reply)

    yield {'type': 'tts', 'audio': audio}

    yield {'type': 'state', 'value': 'idle'}


async def generate_voice_reply(session_id, text, history, tts_model="magpie", language="en-US"):
    agent = detect_agent(text)
    full_reply = ""

    yield {'type': 'agent', 'value': agent}
    yield {'type': 'state', 'value': 'thinking'}

    async for chunk in _call_ollama(session_id, text, agent, history):
        full_reply += chunk
        yield {'type': 'llm', 'text': chunk}

    audio, used_model = await synthesize_cloud_reply(full_reply, tts_model, language)

    yield {
        'type': 'voice_response',
        'reply': full_reply,
        'audio_base64': base64.b64encode(audio).decode('ascii') if audio else '',
        'agent': agent,
        'tts_model': used_model,
        'language': language,
    }

    yield {'type': 'state', 'value': 'idle'}


async def synthesize_cloud_reply(text, tts_model, language="en-US"):
    model_order = [tts_model, "magpie" if tts_model != "magpie" else "chatterbox"]
    last_error = None

    for model in model_order:
        try:
            return await synthesize_nvidia(text, model, language=language), model
        except Exception as error:
            last_error = error

    audio = await synthesize(text)
    if audio:
        return audio, "piper-fallback"

    raise last_error or RuntimeError("NVIDIA TTS synthesis failed")
