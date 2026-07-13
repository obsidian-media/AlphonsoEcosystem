import os
from unittest.mock import patch

from fastapi.testclient import TestClient


def _voice_reply(session_id, text, history):
    async def _gen():
        yield {"type": "agent", "value": "alphonso_core"}
        yield {"type": "state", "value": "thinking"}
        yield {
            "type": "voice_response",
            "reply": f"Echo: {text}",
            "audio_base64": "YXVkaW8=",
            "agent": "alphonso_core",
        }
        yield {"type": "state", "value": "idle"}

    return _gen()


def test_voice_respond_returns_reply_and_audio():
    with patch("main.generate_voice_reply", side_effect=_voice_reply):
        from main import app

        client = TestClient(app)
        response = client.post(
            "/voice/respond",
            json={"session_id": "s1", "text": "hello", "history": [], "tts_model": "magpie"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["session_id"] == "s1"
        assert payload["reply"] == "Echo: hello"
        assert payload["audio_base64"] == "YXVkaW8="
        assert payload["agent"] == "alphonso_core"
        assert payload["tts_model"] == "magpie"


def test_voice_respond_rejects_blank_text():
    with patch("main.generate_voice_reply", side_effect=_voice_reply):
        from main import app

        client = TestClient(app)
        response = client.post(
            "/voice/respond",
            json={"session_id": "s1", "text": "   ", "history": [], "tts_model": "magpie"},
        )

        assert response.status_code == 400


def test_voice_respond_requires_token_when_configured():
    with patch.dict(os.environ, {"VOICE_CLOUD_API_KEY": "secret-token"}, clear=False), \
         patch("main.generate_voice_reply", side_effect=_voice_reply):
        from main import app

        client = TestClient(app)
        response = client.post(
            "/voice/respond",
            json={"session_id": "s1", "text": "hello", "history": [], "tts_model": "magpie"},
        )

        assert response.status_code == 401


def test_voice_respond_rejects_unknown_tts_model():
    with patch("main.generate_voice_reply", side_effect=_voice_reply):
        from main import app

        client = TestClient(app)
        response = client.post(
            "/voice/respond",
            json={"session_id": "s1", "text": "hello", "history": [], "tts_model": "unknown"},
        )

        assert response.status_code == 400
