import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.main import app
from app.lesson_pipeline import LessonPipelineError, Weakness
from app.nvidia import NvidiaError, NvidiaRateLimitError
from app.supabase_auth import SupabaseUser


ENV = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_ANON_KEY": "publishable-key",
    "NVIDIA_API_KEY": "nvidia-key",
    "NVIDIA_NIM_MODEL": "nvidia/nemotron-mini-4b-instruct",
    "NVIDIA_TTS_MAGPIE_URL": "https://example.test/magpie",
    "NVIDIA_TTS_CHATTERBOX_URL": "https://example.test/chatterbox",
}


def test_ready_fails_without_configuration(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    assert TestClient(app).get("/ready").status_code == 503


def test_ready_uses_only_the_active_cloud_voice_dependencies():
    with patch.dict(os.environ, ENV, clear=False):
        response = TestClient(app).get("/ready")

    assert response.status_code == 200
    assert response.json()["device_enrollment"] is True


def test_voice_requires_user_token():
    with patch.dict(os.environ, ENV, clear=False):
        response = TestClient(app).post("/v1/voice/respond", json={"session_id": "s", "text": "hello"})
    assert response.status_code == 401


def test_voice_returns_reply_audio_and_timings():
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="Hello")), \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFFfake-wav")), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock()):
        response = TestClient(app).post(
            "/v1/voice/respond",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={"session_id": "s", "text": "hello", "history": [{"role": "assistant", "content": "Welcome"}]},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reply"] == "Hello"
    assert payload["audio_base64"]
    assert payload["agent"] == "alphonso"
    assert payload["tts_provider"] == "nvidia"
    assert payload["timings_ms"]["total"] >= 0


def test_farsi_voice_uses_selected_piper_voice():
    with patch.dict(os.environ, ENV | {"PIPER_FARSI_URL": "https://piper.example.test", "PIPER_SERVICE_TOKEN": "piper-key"}, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="سلام")), \
         patch("app.main.PiperTTSClient.synthesize", new=AsyncMock(return_value=b"RIFFfake-wav")) as synthesize, \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock()):
        response = TestClient(app).post(
            "/v1/voice/respond",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={"session_id": "s", "text": "سلام", "language": "fa-IR", "piper_voice": "manta"},
        )
    assert response.status_code == 200
    assert response.json()["tts_provider"] == "piper"
    synthesize.assert_awaited_once_with("سلام", "manta")


def test_voice_returns_safe_unavailable_error_when_provider_fails():
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(side_effect=NvidiaError())), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock()):
        response = TestClient(app).post(
            "/v1/voice/respond",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={"session_id": "s", "text": "hello"},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "NVIDIA voice provider is unavailable"


def test_voice_returns_rate_limit_error_without_provider_details():
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(side_effect=NvidiaRateLimitError())), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock()):
        response = TestClient(app).post(
            "/v1/voice/respond",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={"session_id": "s", "text": "hello"},
        )

    assert response.status_code == 429
    assert response.json()["detail"] == "NVIDIA voice provider is rate limited"


def _tutor_request(**overrides):
    body = {"session_id": "s", "text": "I go to store yesterday", "agent_id": "tutor"}
    body.update(overrides)
    return TestClient(app).post(
        "/v1/voice/respond",
        headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
        json=body,
    )


def test_tutor_persona_is_reachable_and_fetches_lesson_context():
    """Regression test for the real gap this closes: previously nothing ever
    called fetch_recent_weaknesses, so the weakness-detection pipeline's
    output never actually reached a live Tutor conversation."""
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="Nice, try again!")) as complete, \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFFfake-wav")), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(return_value=SupabaseUser(id="u1", access_token="tok"))), \
         patch(
             "app.main.fetch_recent_weaknesses",
             new=AsyncMock(return_value=[Weakness(mistake_type="verb_tense", example="I go", corrected_form="I went")]),
         ) as fetch:
        response = _tutor_request()

    assert response.status_code == 200
    fetch.assert_awaited_once()
    system_message = complete.call_args.args[0][0]["content"]
    assert "verb_tense" in system_message
    assert "You are Hector." in system_message


def test_non_tutor_persona_never_fetches_lesson_context():
    """Alphonso (a business persona) has nothing to do with language learning
    -- it must never see a stranger's learner-weakness data."""
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="ok")), \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFFfake-wav")), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(return_value=SupabaseUser(id="u1", access_token="tok"))), \
         patch("app.main.fetch_recent_weaknesses", new=AsyncMock()) as fetch:
        response = TestClient(app).post(
            "/v1/voice/respond",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={"session_id": "s", "text": "hello", "agent_id": "alphonso"},
        )

    assert response.status_code == 200
    fetch.assert_not_awaited()


def test_tutor_persona_degrades_gracefully_when_lesson_context_fetch_fails():
    """A Supabase hiccup fetching past weaknesses must never break an
    otherwise-healthy voice reply -- the Tutor persona works fine without
    lesson context, it just won't reference past mistakes yet."""
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="Hi!")), \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFFfake-wav")), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(return_value=SupabaseUser(id="u1", access_token="tok"))), \
         patch("app.main.fetch_recent_weaknesses", new=AsyncMock(side_effect=LessonPipelineError("boom"))):
        response = _tutor_request()

    assert response.status_code == 200
    assert response.json()["reply"] == "Hi!"


def test_analyze_session_stores_weaknesses_and_reports_count():
    weakness = Weakness(mistake_type="verb_tense", example="I go", corrected_form="I went")
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value='[{"mistake_type": "verb_tense", "example": "I go", "corrected_form": "I went"}]')), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(return_value=SupabaseUser(id="u1", access_token="tok"))), \
         patch("app.lesson_pipeline.store_weaknesses", new=AsyncMock()) as store:
        response = TestClient(app).post(
            "/v1/voice/sessions/analyze",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={
                "session_id": "s",
                "language": "en-US",
                "transcript": [{"role": "user", "content": "I go to store yesterday"}],
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == "s"
    assert payload["weaknesses_found"] == 1
    assert payload["weaknesses_stored"] == 1
    store.assert_awaited_once()


def test_analyze_session_requires_device_auth():
    with patch.dict(os.environ, ENV, clear=False):
        response = TestClient(app).post(
            "/v1/voice/sessions/analyze",
            json={"session_id": "s", "transcript": []},
        )
    assert response.status_code == 401


def test_analyze_session_surfaces_nvidia_failure_as_503():
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(side_effect=NvidiaError())), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(return_value=SupabaseUser(id="u1", access_token="tok"))):
        response = TestClient(app).post(
            "/v1/voice/sessions/analyze",
            headers={"Authorization": "Bearer user-access-token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"},
            json={"session_id": "s", "transcript": [{"role": "user", "content": "hi"}]},
        )
    assert response.status_code == 503
