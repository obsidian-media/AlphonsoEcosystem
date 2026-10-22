import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from unittest.mock import patch, MagicMock
import numpy as np


def test_transcribe_returns_string():
    mock_segment = MagicMock()
    mock_segment.text = "hello world"
    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([mock_segment], None)

    with patch("stt._load_model", return_value=mock_model):
        from stt import transcribe
        pcm = (np.zeros(16000, dtype=np.int16)).tobytes()
        result = transcribe(pcm)
        assert isinstance(result, str)
        assert "hello" in result


def test_transcribe_empty_audio():
    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([], None)

    with patch("stt._load_model", return_value=mock_model):
        from stt import transcribe
        pcm = bytes(3200)
        result = transcribe(pcm)
        assert result == ""


def test_no_subprocess_calls():
    import stt
    import inspect
    source = inspect.getsource(stt)
    assert "subprocess" not in source
    assert "tempfile" not in source


# QA 2026-10-22: the speech-recognition model and language were fixed.
def test_stt_model_and_language_come_from_the_launcher(monkeypatch):
    import stt
    monkeypatch.delenv("VOICE_STT_MODEL", raising=False)
    monkeypatch.delenv("VOICE_STT_LANGUAGE", raising=False)
    assert stt.stt_model_name() == "tiny.en"
    assert stt.stt_language() == "en"
    monkeypatch.setenv("VOICE_STT_MODEL", "small")
    monkeypatch.setenv("VOICE_STT_LANGUAGE", "fa")
    assert stt.stt_language() == "fa"
    monkeypatch.setenv("VOICE_STT_LANGUAGE", "auto")
    assert stt.stt_language() is None
    monkeypatch.setenv("VOICE_STT_MODEL", "base.en")
    assert stt.stt_language() == "en"
