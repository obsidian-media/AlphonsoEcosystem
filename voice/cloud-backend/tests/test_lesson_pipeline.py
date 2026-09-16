import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.config import Settings
from app.contracts import ChatMessage
from app.lesson_pipeline import (
    LessonPipelineError,
    LessonPipelineExtractionError,
    Weakness,
    analyze_transcript,
    build_lesson_context,
    fetch_recent_weaknesses,
    store_weaknesses,
)
from app.supabase_auth import SupabaseUser

SETTINGS = Settings(
    nvidia_api_key="nvidia-key",
    nim_base_url="https://example.test/v1",
    nim_model="meta/llama-3.2-11b-vision-instruct",
    magpie_url="https://example.test/magpie",
    magpie_voice="Aria",
    chatterbox_url="",
    chatterbox_voice="",
    piper_farsi_url="",
    piper_service_token="",
    piper_farsi_default_voice="mana",
    request_timeout_seconds=5.0,
    supabase_url="https://example.supabase.co",
    supabase_anon_key="publishable-key",
    atlas_control_plane_demo_mode=False,
)

USER = SupabaseUser(id="11111111-1111-1111-1111-111111111111", access_token="user-access-token")

TRANSCRIPT = [
    ChatMessage(role="user", content="I go to store yesterday"),
    ChatMessage(role="assistant", content="Almost -- try 'I went to the store yesterday.'"),
]


def _run(coro):
    return asyncio.run(coro)


def test_analyze_transcript_parses_valid_json_array():
    raw = (
        '[{"mistake_type": "verb_tense", "example": "I go to store yesterday", '
        '"corrected_form": "I went to the store yesterday"}]'
    )
    with patch("app.lesson_pipeline.NvidiaClient.complete", new=AsyncMock(return_value=raw)):
        weaknesses = _run(analyze_transcript(SETTINGS, TRANSCRIPT, "en-US"))
    assert weaknesses == [
        Weakness(
            mistake_type="verb_tense",
            example="I go to store yesterday",
            corrected_form="I went to the store yesterday",
        )
    ]


def test_analyze_transcript_strips_markdown_code_fences():
    raw = '```json\n[{"mistake_type": "vocabulary", "example": "a", "corrected_form": "b"}]\n```'
    with patch("app.lesson_pipeline.NvidiaClient.complete", new=AsyncMock(return_value=raw)):
        weaknesses = _run(analyze_transcript(SETTINGS, TRANSCRIPT, "en-US"))
    assert len(weaknesses) == 1
    assert weaknesses[0].mistake_type == "vocabulary"


def test_analyze_transcript_returns_empty_list_when_no_mistakes_found():
    with patch("app.lesson_pipeline.NvidiaClient.complete", new=AsyncMock(return_value="[]")):
        weaknesses = _run(analyze_transcript(SETTINGS, TRANSCRIPT, "en-US"))
    assert weaknesses == []


def test_analyze_transcript_skips_llm_call_for_empty_transcript():
    with patch("app.lesson_pipeline.NvidiaClient.complete", new=AsyncMock()) as complete:
        weaknesses = _run(analyze_transcript(SETTINGS, [], "en-US"))
    assert weaknesses == []
    complete.assert_not_awaited()


def test_analyze_transcript_rejects_unparseable_output():
    """A 502, not the base class's 503: the NVIDIA call succeeded (no
    availability failure), it just returned unusable output -- see
    LessonPipelineExtractionError's docstring for why this distinction
    matters."""
    with patch("app.lesson_pipeline.NvidiaClient.complete", new=AsyncMock(return_value="not json")):
        with pytest.raises(LessonPipelineExtractionError) as excinfo:
            _run(analyze_transcript(SETTINGS, TRANSCRIPT, "en-US"))
    assert excinfo.value.status_code == 502


def test_analyze_transcript_drops_incomplete_items():
    raw = '[{"mistake_type": "vocabulary"}, {"mistake_type": "x", "example": "y", "corrected_form": "z"}]'
    with patch("app.lesson_pipeline.NvidiaClient.complete", new=AsyncMock(return_value=raw)):
        weaknesses = _run(analyze_transcript(SETTINGS, TRANSCRIPT, "en-US"))
    assert len(weaknesses) == 1
    assert weaknesses[0].mistake_type == "x"


SESSION_ID = "session-123"


def test_store_weaknesses_skips_request_when_nothing_to_store():
    with patch("httpx.AsyncClient.post", new=AsyncMock()) as post:
        _run(store_weaknesses(SETTINGS, USER, SESSION_ID, "en-US", []))
    post.assert_not_awaited()


def test_store_weaknesses_upserts_rows_with_session_id():
    weakness = Weakness(mistake_type="verb_tense", example="I go", corrected_form="I went")
    response = httpx.Response(201, request=httpx.Request("POST", "https://example.supabase.co"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=response)) as post:
        _run(store_weaknesses(SETTINGS, USER, SESSION_ID, "en-US", [weakness]))
    post.assert_awaited_once()
    _, kwargs = post.call_args
    assert kwargs["json"] == [
        {
            "user_id": USER.id,
            "session_id": SESSION_ID,
            "language": "en-US",
            "mistake_type": "verb_tense",
            "example": "I go",
            "corrected_form": "I went",
        }
    ]
    # The whole point of storing this way: idempotent under a client retry,
    # and collapses the same mistake across sessions into one row, via
    # PostgREST's upsert-on-conflict, not a plain insert.
    assert kwargs["params"] == {"on_conflict": "user_id,language,mistake_type"}
    assert kwargs["headers"]["Prefer"] == "resolution=merge-duplicates,return=minimal"


def test_store_weaknesses_raises_on_failure():
    weakness = Weakness(mistake_type="verb_tense", example="I go", corrected_form="I went")
    response = httpx.Response(500, request=httpx.Request("POST", "https://example.supabase.co"), text="boom")
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=response)):
        with pytest.raises(LessonPipelineError):
            _run(store_weaknesses(SETTINGS, USER, SESSION_ID, "en-US", [weakness]))


def test_fetch_recent_weaknesses_parses_rows():
    rows = [{"mistake_type": "verb_tense", "example": "I go", "corrected_form": "I went"}]
    response = httpx.Response(200, request=httpx.Request("GET", "https://example.supabase.co"), json=rows)
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=response)):
        weaknesses = _run(fetch_recent_weaknesses(SETTINGS, USER, "en-US"))
    assert weaknesses == [Weakness(mistake_type="verb_tense", example="I go", corrected_form="I went")]


def test_fetch_recent_weaknesses_excludes_stale_entries_via_created_at_filter():
    """The staleness/"resolution" mechanism: a mistake not seen recently is
    excluded via a created_at recency window, not a separate resolved flag."""
    response = httpx.Response(200, request=httpx.Request("GET", "https://example.supabase.co"), json=[])
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=response)) as get:
        _run(fetch_recent_weaknesses(SETTINGS, USER, "en-US"))
    _, kwargs = get.call_args
    assert kwargs["params"]["created_at"].startswith("gte.")


def test_fetch_recent_weaknesses_raises_on_failure():
    response = httpx.Response(500, request=httpx.Request("GET", "https://example.supabase.co"), text="boom")
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=response)):
        with pytest.raises(LessonPipelineError):
            _run(fetch_recent_weaknesses(SETTINGS, USER, "en-US"))


def test_build_lesson_context_returns_none_when_empty():
    assert build_lesson_context([]) is None


def test_build_lesson_context_summarizes_weaknesses():
    weakness = Weakness(mistake_type="verb_tense", example="I go", corrected_form="I went")
    context = build_lesson_context([weakness])
    assert "verb_tense" in context
    assert "I go" in context
    assert "I went" in context
