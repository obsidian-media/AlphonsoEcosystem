from fastapi import FastAPI, WebSocket
import asyncio
from pipeline import run_pipeline
from session import register
from state import current_state

app = FastAPI()

async def alphonso_llm(session_id, text, agent):
    return f'Alphonso: I understood \"{text}\"'

@app.websocket('/ws')
async def ws(ws: WebSocket):
    await ws.accept()
    session = ws.headers.get('x-session', 'anon')

    buffer = bytearray()

    async def process(pcm):
        global current_state

        async for event in run_pipeline(session, pcm, alphonso_llm):
            if event['type'] == 'stt':
                await ws.send_json(event)

            elif event['type'] == 'llm':
                await ws.send_json(event)

            elif event['type'] == 'state':
                current_state = event['value']
                await ws.send_json(event)

            elif event['type'] == 'tts':
                await ws.send_bytes(event['audio'])

    while True:
        msg = await ws.receive()

        # 🔥 BARGE-IN SUPPORT (user interrupts speaking)
        if current_state == 'speaking' and 'bytes' in msg:
            buffer = bytearray()  # reset immediately

        if 'bytes' in msg:
            buffer.extend(msg['bytes'])

            if len(buffer) > 24000:
                task = asyncio.create_task(process(bytes(buffer)))
                register(session, task)
                buffer = bytearray()
