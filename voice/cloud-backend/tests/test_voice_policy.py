import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.voice_policy import VoicePolicyError, build_system_message, get_voice_agent


def test_alphonso_farsi_policy_is_concise_and_localized():
    message = build_system_message(agent_id="alphonso", language="fa-IR")

    assert "Persian (fa-IR)" in message
    assert "just a language model" in message
    assert get_voice_agent("alphonso").display_name == "Alphonso"


def test_all_nine_agents_have_voice_profiles():
    assert all(get_voice_agent(agent_id) for agent_id in (
        "alphonso", "jose", "hector", "miya", "maria", "marcus", "echo", "sentinel", "nova"
    ))


def test_unknown_agent_and_language_are_rejected():
    assert get_voice_agent("unknown") is None
    with pytest.raises(VoicePolicyError):
        build_system_message(agent_id="unknown", language="en-US")
    with pytest.raises(VoicePolicyError):
        build_system_message(agent_id="alphonso", language="it-IT")
