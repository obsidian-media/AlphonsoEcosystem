import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from unittest.mock import patch


def test_missing_model_is_safe_and_does_not_download():
    import tts

    tts._load_piper.cache_clear()
    with patch("tts.Path.exists", return_value=False), patch("piper.PiperVoice.load") as mock_load:
        assert tts._load_piper() is None
    mock_load.assert_not_called()
    tts._load_piper.cache_clear()


def test_model_path_uses_runtime_hub_directory_when_configured(monkeypatch, tmp_path):
    import tts

    monkeypatch.setenv("VOICE_PIPER_MODEL_DIR", str(tmp_path))
    assert tts._model_path() == tmp_path / "en_US-lessac-medium.onnx"
    with patch("tts.Path.exists", return_value=False):
        assert tts._load_piper() is None
    tts._load_piper.cache_clear()


def test_synthesis_uses_current_piper_api():
    import tts

    voice = type("Voice", (), {"config": type("Config", (), {"sample_rate": 22050})(), "synthesize_wav": lambda self, text, wav: None})()
    with patch("tts._load_piper", return_value=voice):
        assert tts._synthesize_sync("hello")[:4] == b"RIFF"
