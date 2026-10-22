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

# ── UtteranceCollector (QA 2026-10-22) ──────────────────────────────────────
# A sentence used to be cut every 1.5 s and each piece answered on its own.
from vad import UtteranceCollector

FRAME = UtteranceCollector.FRAME_BYTES
SPEECH = b'\x01' * FRAME   # the test classifier calls a frame starting with 0x01 speech
SILENCE = b'\x00' * FRAME


def _collector(**kw):
    return UtteranceCollector(classify=lambda frame: frame[:1] == b'\x01', **kw)


def test_a_whole_sentence_becomes_one_utterance_after_the_pause():
    c = _collector(end_silence_ms=300, pre_roll_ms=0)
    out = []
    # 3 s of speech with short gaps (shorter than the end pause), sent in uneven chunks.
    stream = (SPEECH * 40 + SILENCE * 5) * 2 + SPEECH * 20 + SILENCE * 12
    for i in range(0, len(stream), 1000):
        out += c.feed(stream[i:i + 1000])
    assert len(out) == 1
    assert len(out[0]) >= FRAME * 100


def test_silence_alone_is_never_an_utterance():
    c = _collector()
    assert c.feed(SILENCE * 200) == []
    assert not c.in_utterance


def test_keeps_a_little_audio_from_just_before_the_speech():
    c = _collector(end_silence_ms=90, pre_roll_ms=90)
    out = c.feed(SILENCE * 10 + SPEECH * 5 + SILENCE * 3)
    assert out[0].startswith(SILENCE * 3 + SPEECH)


def test_a_long_monologue_is_still_answered():
    c = _collector(max_ms=900)
    out = c.feed(SPEECH * 61)
    assert len(out) == 2


def test_reset_drops_a_half_finished_utterance():
    c = _collector()
    c.feed(SPEECH * 10)
    assert c.in_utterance
    c.reset()
    assert not c.in_utterance
