from stt import transcribe
from tts import synthesize
from router import detect_agent

async def run_pipeline(session_id, pcm, llm):
    text = transcribe(pcm)

    if not text:
        return

    yield {'type': 'stt', 'text': text}

    yield {'type': 'state', 'value': 'thinking'}

    reply = await llm(session_id, text, detect_agent(text))

    # STREAM TOKENS STYLE (simulated split)
    for chunk in reply.split():
        yield {'type': 'llm', 'text': chunk + ' '}

    yield {'type': 'state', 'value': 'speaking'}

    audio = synthesize(reply)

    yield {'type': 'tts', 'audio': audio}

    yield {'type': 'state', 'value': 'idle'}
