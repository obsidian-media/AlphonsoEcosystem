import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.config import Settings
from app.contracts import VoiceRequest


def test_request_rejects_unknown_history_role():
    with pytest.raises(ValidationError):
        VoiceRequest(session_id="s", text="hello", history=[{"role": "system", "content": "x"}])


def test_request_limits_history_to_twelve_entries():
    history = [{"role": "user", "content": "x"}] * 13
    with pytest.raises(ValidationError):
        VoiceRequest(session_id="s", text="hello", history=history)


def test_request_accepts_farsi_and_selected_agent():
    request = VoiceRequest(session_id="s", text="سلام", language="fa-IR", agent_id="maria")

    assert request.language == "fa-IR"
    assert request.agent_id == "maria"


def test_request_rejects_unknown_agent_and_language():
    with pytest.raises(ValidationError):
        VoiceRequest(session_id="s", text="hello", language="it-IT", agent_id="unknown")


def test_missing_service_key_is_not_ready(monkeypatch):
    monkeypatch.delenv("VOICE_CLOUD_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    assert Settings.from_env().is_ready is False
