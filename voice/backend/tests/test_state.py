import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from state import get_state, set_state, remove_state, VoiceState


def test_default_idle():
    assert get_state("new-session") == VoiceState.IDLE


def test_set_and_get():
    set_state("s1", "listening")
    assert get_state("s1") == VoiceState.LISTENING


def test_set_multiple_sessions():
    set_state("a", "thinking")
    set_state("b", "speaking")
    assert get_state("a") == VoiceState.THINKING
    assert get_state("b") == VoiceState.SPEAKING


def test_remove():
    set_state("x", "thinking")
    remove_state("x")
    assert get_state("x") == VoiceState.IDLE


def test_remove_nonexistent():
    remove_state("nonexistent")  # must not raise
