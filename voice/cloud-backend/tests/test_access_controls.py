"""Pre-launch audit (2026-09-30) regressions: invite-only access, per-user
quotas, and per-user isolation of the Tutor lesson-context cache."""

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.config import Settings
from app.main import _lesson_context_cache, app
from app.quota import UserQuota, voice_quota
from app.supabase_auth import SupabaseDeviceRegistry, SupabaseUser

ENV = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_ANON_KEY": "publishable-key",
    "NVIDIA_API_KEY": "nvidia-key",
    "NVIDIA_NIM_MODEL": "nvidia/nemotron-mini-4b-instruct",
    "NVIDIA_TTS_MAGPIE_URL": "https://example.test/magpie",
}
HEADERS = {"Authorization": "Bearer token", "X-Alphonso-Device-Id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"}


@pytest.fixture(autouse=True)
def _isolate():
    _lesson_context_cache.clear()
    voice_quota.reset()
    yield
    _lesson_context_cache.clear()
    voice_quota.reset()


# --- invite-only access -----------------------------------------------------

def _settings(**env: str) -> Settings:
    with patch.dict(os.environ, ENV | env, clear=False):
        for key in ("VOICE_ACCESS_MODE", "VOICE_ALLOWED_EMAILS"):
            if key not in env:
                os.environ.pop(key, None)
        return Settings.from_env()


def test_invite_mode_is_the_default_and_rejects_unlisted_emails():
    settings = _settings()
    assert settings.voice_access_mode == "invite"
    assert settings.is_email_allowed("stranger@example.com") is False
    assert settings.is_email_allowed(None) is False


def test_invite_mode_accepts_listed_emails_case_insensitively():
    settings = _settings(VOICE_ALLOWED_EMAILS=" Owner@Example.com , friend@example.com")
    assert settings.is_email_allowed("owner@example.com") is True
    assert settings.is_email_allowed("FRIEND@example.com") is True
    assert settings.is_email_allowed("other@example.com") is False


def test_open_mode_accepts_any_signed_in_account():
    assert _settings(VOICE_ACCESS_MODE="open").is_email_allowed("anyone@example.com") is True


class _FakeAsyncClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        return self._response


@pytest.mark.anyio
async def test_user_from_authorization_rejects_uninvited_account():
    settings = _settings(VOICE_ALLOWED_EMAILS="owner@example.com")
    response = httpx.Response(200, json={"id": "user-1", "email": "stranger@example.com"}, request=httpx.Request("GET", "https://x"))
    with patch("app.supabase_auth.httpx.AsyncClient", return_value=_FakeAsyncClient(response)):
        with pytest.raises(HTTPException) as exc:
            await SupabaseDeviceRegistry(settings).user_from_authorization("Bearer t")
    assert exc.value.status_code == 403


@pytest.mark.anyio
async def test_user_from_authorization_accepts_invited_account():
    settings = _settings(VOICE_ALLOWED_EMAILS="owner@example.com")
    response = httpx.Response(200, json={"id": "user-1", "email": "Owner@example.com"}, request=httpx.Request("GET", "https://x"))
    with patch("app.supabase_auth.httpx.AsyncClient", return_value=_FakeAsyncClient(response)):
        user = await SupabaseDeviceRegistry(settings).user_from_authorization("Bearer t")
    assert user.id == "user-1"


@pytest.fixture
def anyio_backend():
    return "asyncio"


# --- quotas -----------------------------------------------------------------

def test_per_minute_burst_limit(monkeypatch):
    monkeypatch.setenv("VOICE_RATE_PER_MINUTE", "3")
    monkeypatch.setenv("VOICE_DAILY_QUOTA", "0")
    quota = UserQuota()
    for i in range(3):
        quota.check_and_record("u", now=1000.0 + i)
    with pytest.raises(HTTPException) as exc:
        quota.check_and_record("u", now=1003.0)
    assert exc.value.status_code == 429
    # another user is unaffected, and the window slides
    quota.check_and_record("other", now=1003.0)
    quota.check_and_record("u", now=1070.0)


def test_daily_quota(monkeypatch):
    monkeypatch.setenv("VOICE_RATE_PER_MINUTE", "0")
    monkeypatch.setenv("VOICE_DAILY_QUOTA", "2")
    quota = UserQuota()
    quota.check_and_record("u", now=0.0)
    quota.check_and_record("u", now=10.0)
    with pytest.raises(HTTPException) as exc:
        quota.check_and_record("u", now=20.0)
    assert "Daily" in exc.value.detail
    quota.check_and_record("u", now=86_500.0)  # first event aged out


def test_respond_endpoint_enforces_quota(monkeypatch):
    monkeypatch.setenv("VOICE_RATE_PER_MINUTE", "1")
    user = SupabaseUser(id="quota-user", access_token="t")
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="Hi")), \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFF")), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(return_value=user)):
        client = TestClient(app)
        first = client.post("/v1/voice/respond", headers=HEADERS, json={"session_id": "s", "text": "hello"})
        second = client.post("/v1/voice/respond", headers=HEADERS, json={"session_id": "s", "text": "hello"})
    assert first.status_code == 200
    assert second.status_code == 429


# --- per-user lesson-context cache -----------------------------------------

def test_lesson_context_cache_is_not_shared_across_users():
    alice = SupabaseUser(id="alice", access_token="a")
    mallory = SupabaseUser(id="mallory", access_token="m")
    fetch = AsyncMock(side_effect=lambda settings, user, language: [])
    with patch.dict(os.environ, ENV, clear=False), \
         patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="Hi")), \
         patch("app.main.NvidiaClient.synthesize", new=AsyncMock(return_value=b"RIFF")), \
         patch("app.main.fetch_recent_weaknesses", new=fetch), \
         patch("app.main.SupabaseDeviceRegistry.require_active_device", new=AsyncMock(side_effect=[alice, mallory])):
        client = TestClient(app)
        body = {"session_id": "shared-session", "text": "hola", "agent_id": "tutor"}
        assert client.post("/v1/voice/respond", headers=HEADERS, json=body).status_code == 200
        assert client.post("/v1/voice/respond", headers=HEADERS, json=body).status_code == 200
    # Mallory reusing Alice's session id must trigger her OWN fetch, not a cache hit.
    assert fetch.await_count == 2
    assert {call.args[1].id for call in fetch.await_args_list} == {"alice", "mallory"}
