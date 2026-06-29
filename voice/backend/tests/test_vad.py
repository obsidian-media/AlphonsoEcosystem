import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from vad import is_speech, voice_activity_level


def test_is_speech_returns_false_for_empty():
    assert is_speech(b'') == False


def test_is_speech_returns_false_for_silence():
    silence = b'\x00' * 1600  # 100ms of silence at 16kHz
    assert is_speech(silence) == False


def test_is_speech_accepts_valid_pcm():
    # Generate some noise-like audio (not actually speech but well-formed PCM)
    noise = bytes([i % 256 for i in range(0, 6400)])  # 200ms of varying bytes
    # This tests the function doesn't crash on valid input
    result = is_speech(noise)
    assert isinstance(result, bool)


def test_voice_activity_level_returns_zero_for_empty():
    assert voice_activity_level(b'') == 0.0


def test_voice_activity_level_handles_silence():
    silence = b'\x00' * 1600
    result = voice_activity_level(silence)
    assert result == 0.0


def test_voice_activity_level_handles_short_input():
    short = b'\x00\x00'
    result = voice_activity_level(short)
    assert isinstance(result, float)