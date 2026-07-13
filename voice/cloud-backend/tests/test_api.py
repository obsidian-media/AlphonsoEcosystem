import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.main import app


ENV = {
    "VOICE_CLOUD_API_KEY": "voice-key",
    "NVIDIA_API_KEY": "nvidia-key",
    "NVIDIA_NIM_MODEL": "nvidia/nemotron-mini-4b-instruct",
    "NVIDIA_TTS_MAGPIE_URL": "https://example.test/magpie",
    "NVIDIA_TTS_CHATTERBOX_URL": "https://example.test/chatterbox",
}


def test_ready_fails_without_configuration(monkeypatch):
    monkeypatch.delenv("VOICE_CLOUD_API_KEY", raising=False)
    assert TestClient(app).get("/ready").status_code == 503


def test_voice_requires_bearer_token():
    with patch.dict(os.environ, ENV, clear=False):
        response = TestClient(app).post("/v1/voice/respond", json={"session_id": "s", "text": "hello"})
    assert response.status_code == 401


def test_voice_returns_reply_audio_and_timings():
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="Hello")), \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFFfake-wav")):
        response = TestClient(app).post(
            "/v1/voice/respond",
            headers={"Authorization": "Bearer voice-key"},
            json={"session_id": "s", "text": "hello", "history": [{"role": "assistant", "content": "Welcome"}]},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reply"] == "Hello"
    assert payload["audio_base64"]
    assert payload["agent"] == "alphonso"
    assert payload["tts_provider"] == "nvidia"
    assert payload["timings_ms"]["total"] >= 0
