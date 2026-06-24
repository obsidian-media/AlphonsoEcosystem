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
