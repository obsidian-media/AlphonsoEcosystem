from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from app.config import Settings
from app.contracts import ChatMessage
from app.nvidia import NvidiaClient
from app.supabase_auth import SupabaseUser

logger = logging.getLogger(__name__)

# Offline pipeline: this module analyzes a *completed* conversation transcript
# and writes findings for a later Tutor session to reuse -- not latency-critical,
# per the Live Tutor scope decision (see
# docs/HANDOFF-alphonso-language-companion.md in the OBSIDIAN-TEAM-BOARDROOM
# repo). It is triggered by POST /v1/voice/sessions/analyze (app/main.py),
# called by the client once a session ends -- not from the real-time
# /v1/voice/respond turn-by-turn path.

_MAX_WEAKNESSES_PER_ANALYSIS = 8
_DEFAULT_LESSON_CONTEXT_LIMIT = 5
# A weakness not seen again within this window is treated as stale and drops
# out of fetch_recent_weaknesses -- the "resolution" signal is implicit
# (created_at stops advancing once the learner stops making that mistake),
# not a separate resolved flag. See the migration's comment on the unique
# constraint for the full reasoning.
_WEAKNESS_STALE_AFTER = timedelta(days=30)

_EXTRACTION_SYSTEM_PROMPT = (
    "You analyze a language learner's conversation transcript and extract recurring "
    "mistakes. Respond with ONLY a JSON array (no prose, no markdown fences). Each "
    "element must be an object with exactly these string fields: "
    '"mistake_type" (a short category, e.g. "verb_tense", "preposition", '
    '"word_order", "vocabulary"), "example" (the learner\'s exact incorrect phrase, '
    'quoted from the transcript), "corrected_form" (the natural correct phrasing). '
    "Only include real, clear mistakes the learner actually made in the transcript "
    "below -- do not invent mistakes, and return an empty array [] if none are "
    f"found. Return at most {_MAX_WEAKNESSES_PER_ANALYSIS} items, the most "
    "instructive ones."
)


class LessonPipelineError(Exception):
    """
    Raised when weakness storage/retrieval fails.

    503: the failure is in a downstream service (Supabase) being unavailable,
    not in anything the request itself did wrong -- mirrors NvidiaError's
    default in app/nvidia.py.
    """

    status_code = 503
    safe_message = "Could not analyze this session"


class LessonPipelineExtractionError(LessonPipelineError):
    """
    Raised when the NVIDIA NIM extraction call itself returns unusable output.

    502, not 503: the upstream call succeeded (no network/availability
    failure), it just returned something this service can't parse as the
    structured mistakes format it asked for -- mirrors nvidia.py's own
    502 case for "provider returned invalid output," not its 503 default.
    """

    status_code = 502
    safe_message = "Session analysis returned invalid output"


@dataclass(frozen=True)
class Weakness:
    mistake_type: str
    example: str
    corrected_form: str


def _transcript_text(transcript: list[ChatMessage]) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in transcript)


def _strip_code_fence(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[1]
    return cleaned.strip()


def _parse_weaknesses(raw: str) -> list[Weakness]:
    try:
        data = json.loads(_strip_code_fence(raw))
    except (json.JSONDecodeError, ValueError) as error:
        logger.error("Lesson pipeline could not parse NVIDIA extraction output: %s", error)
        raise LessonPipelineExtractionError("Weakness extraction returned unparseable output") from error
    if not isinstance(data, list):
        raise LessonPipelineExtractionError("Weakness extraction did not return a JSON array")
    weaknesses: list[Weakness] = []
    for item in data[:_MAX_WEAKNESSES_PER_ANALYSIS]:
        if not isinstance(item, dict):
            continue
        mistake_type = str(item.get("mistake_type", "")).strip()
        example = str(item.get("example", "")).strip()
        corrected_form = str(item.get("corrected_form", "")).strip()
        if mistake_type and example and corrected_form:
            weaknesses.append(Weakness(mistake_type=mistake_type, example=example, corrected_form=corrected_form))
    return weaknesses


async def analyze_transcript(
    settings: Settings,
    transcript: list[ChatMessage],
    language: str,
    client: NvidiaClient | None = None,
) -> list[Weakness]:
    """
    Extract recurring learner mistakes from a completed conversation transcript.

    Offline/async only. Reuses the same NvidiaClient used for real-time replies,
    but this call is expected to run after a session ends, not during one.
    """
    if not transcript:
        return []
    nvidia = client or NvidiaClient(settings)
    messages = [
        {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": f"Language: {language}\n\nTranscript:\n{_transcript_text(transcript)}"},
    ]
    raw = await nvidia.complete(messages)
    return _parse_weaknesses(raw)


async def analyze_and_store(
    settings: Settings,
    user: SupabaseUser,
    session_id: str,
    transcript: list[ChatMessage],
    language: str,
    client: NvidiaClient | None = None,
) -> list[Weakness]:
    """
    Run the full offline pipeline for one completed session: analyze, then persist.

    The single entry point POST /v1/voice/sessions/analyze calls. Returns the
    weaknesses that were found (and stored) so the caller can report a count;
    an empty transcript or a transcript with no real mistakes both return [],
    which is a normal, non-error outcome -- not every session teaches something
    new.
    """
    weaknesses = await analyze_transcript(settings, transcript, language, client)
    await store_weaknesses(settings, user, session_id, language, weaknesses)
    return weaknesses


def _user_headers(anon_key: str, access_token: str) -> dict[str, str]:
    """Use the user's JWT so Supabase RLS enforces weakness-row ownership."""
    return {"apikey": anon_key, "Authorization": f"Bearer {access_token}"}


async def store_weaknesses(
    settings: Settings,
    user: SupabaseUser,
    session_id: str,
    language: str,
    weaknesses: list[Weakness],
) -> None:
    """
    Upsert extracted weaknesses to Supabase, keyed by (user, language, mistake_type).

    Offline/async only. An upsert, not a plain insert: PostgREST's
    `Prefer: resolution=merge-duplicates` + `on_conflict` make this
    `INSERT ... ON CONFLICT (user_id, language, mistake_type) DO UPDATE` --
    idempotent under client retries, and naturally collapses the same
    recurring mistake across sessions into one row instead of piling up
    duplicates. See the migration's unique-constraint comment for the full
    reasoning.
    """
    if not weaknesses:
        return
    rows = [
        {
            "user_id": user.id,
            "session_id": session_id,
            "language": language,
            "mistake_type": weakness.mistake_type,
            "example": weakness.example,
            "corrected_form": weakness.corrected_form,
        }
        for weakness in weaknesses
    ]
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/voice_learner_weaknesses",
            params={"on_conflict": "user_id,language,mistake_type"},
            headers={
                **_user_headers(settings.supabase_anon_key, user.access_token),
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=rows,
        )
    if response.status_code not in (200, 201):
        logger.error(
            "Lesson pipeline could not store weaknesses: %s %s",
            response.status_code,
            response.text[:500],
        )
        raise LessonPipelineError("Could not store learner weaknesses")


async def fetch_recent_weaknesses(
    settings: Settings,
    user: SupabaseUser,
    language: str,
    limit: int = _DEFAULT_LESSON_CONTEXT_LIMIT,
) -> list[Weakness]:
    """
    Read a user's recently-seen weaknesses for a language. Offline/async only.

    "Recently-seen" is the staleness/resolution mechanism: a mistake whose
    created_at hasn't advanced in _WEAKNESS_STALE_AFTER (i.e. the learner
    hasn't made it again in any session since) is excluded -- it's aged out
    rather than kept surfacing indefinitely. See the migration's
    unique-constraint comment for why this works without a separate resolved
    flag.
    """
    cutoff = (datetime.now(timezone.utc) - _WEAKNESS_STALE_AFTER).isoformat()
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/voice_learner_weaknesses",
            params={
                "select": "mistake_type,example,corrected_form",
                "user_id": f"eq.{user.id}",
                "language": f"eq.{language}",
                "created_at": f"gte.{cutoff}",
                "order": "created_at.desc",
                "limit": str(limit),
            },
            headers=_user_headers(settings.supabase_anon_key, user.access_token),
        )
    if response.status_code != 200:
        logger.error(
            "Lesson pipeline could not fetch weaknesses: %s %s",
            response.status_code,
            response.text[:500],
        )
        raise LessonPipelineError("Could not fetch learner weaknesses")
    return [
        Weakness(
            mistake_type=row["mistake_type"],
            example=row["example"],
            corrected_form=row["corrected_form"],
        )
        for row in response.json()
    ]


def build_lesson_context(weaknesses: list[Weakness]) -> str | None:
    """
    Turn stored weaknesses into a short lesson-context string.

    For a Tutor persona's system prompt (see
    voice_policy.build_system_message's lesson_context param). Returns None
    when there is nothing to add, so callers can skip it cleanly.
    """
    if not weaknesses:
        return None
    points = "; ".join(
        f'{weakness.mistake_type} (e.g. "{weakness.example}" -> "{weakness.corrected_form}")'
        for weakness in weaknesses
    )
    return (
        "This learner has recently struggled with: "
        + points
        + ". Watch for these patterns and reinforce the correct forms naturally "
        "in conversation, without turning the session into a review of past mistakes."
    )
