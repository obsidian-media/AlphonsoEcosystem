import json
import base64
import httpx

from stt import transcribe
from tts import synthesize
from router import detect_agent
from vad import is_speech

OLLAMA_URL = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "llama3.2"


async def _call_ollama(session_id, text, agent, history):
    """Stream a reply from Ollama's /api/chat, yielding text chunks as they arrive."""
    messages = [*history, {"role": "user", "content": text}]
    payload = {"model": DEFAULT_MODEL, "messages": messages, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("POST", OLLAMA_URL, json=payload) as response:
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


async def generate_voice_reply(session_id, text, history):
    agent = detect_agent(text)
    full_reply = ""

    yield {'type': 'agent', 'value': agent}
    yield {'type': 'state', 'value': 'thinking'}

    async for chunk in _call_ollama(session_id, text, agent, history):
        full_reply += chunk
        yield {'type': 'llm', 'text': chunk}

    audio = await synthesize(full_reply)

    yield {
        'type': 'voice_response',
        'reply': full_reply,
        'audio_base64': base64.b64encode(audio).decode('ascii') if audio else '',
        'agent': agent,
    }

    yield {'type': 'state', 'value': 'idle'}
