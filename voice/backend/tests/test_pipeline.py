import sys, os, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from unittest.mock import patch, AsyncMock, MagicMock
import numpy as np


def _pcm():
    return (np.ones(16000, dtype=np.int16) * 1000).tobytes()


def test_pipeline_yields_event_types():
    async def fake_ollama(session_id, text, agent, history):
        yield "test reply"

    with patch("pipeline._call_ollama", new=fake_ollama), \
         patch("pipeline.is_speech", return_value=True), \
         patch("pipeline.transcribe", return_value="hello"), \
         patch("pipeline.synthesize", new_callable=AsyncMock, return_value=b"audio"):

        from pipeline import run_pipeline
        async def _collect():
            events = []
            async for e in run_pipeline("s1", _pcm(), []):
                events.append(e)
            return events

        events = asyncio.run(_collect())
        types = {e["type"] for e in events}
        assert "stt" in types
        assert "agent" in types
        assert "llm" in types
        assert "state" in types
        assert "tts" in types


def test_pipeline_silent_audio_no_events():
    with patch("pipeline.is_speech", return_value=False):
        from pipeline import run_pipeline
        async def _collect():
            events = []
            async for e in run_pipeline("s2", _pcm(), []):
                events.append(e)
            return events

        events = asyncio.run(_collect())
        assert events == []


def test_pipeline_accepts_conversation_history():
    async def fake_ollama(session_id, text, agent, history):
        assert isinstance(history, list)
        yield "ok"

    with patch("pipeline._call_ollama", new=fake_ollama), \
         patch("pipeline.is_speech", return_value=True), \
         patch("pipeline.transcribe", return_value="hi"), \
         patch("pipeline.synthesize", new_callable=AsyncMock, return_value=b"a"):

        from pipeline import run_pipeline
        history = [{"role": "user", "content": "previous message"}]
        async def _run():
            async for _ in run_pipeline("s3", _pcm(), history):
                pass

        asyncio.run(_run())
