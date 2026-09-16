from __future__ import annotations

import base64
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.config import Settings
from app.atlas_control_plane import (
    AtlasActionChallengeResponse,
    AtlasAuditReceiptResponse,
    AtlasBriefingResponse,
    AtlasDecisionActionConfirmationRequest,
    AtlasDecisionActionConfirmationResponse,
    AtlasDecisionResponse,
    AtlasDecisionReviewRequest,
    AtlasDemoControlPlane,
    AtlasDeviceEnrollmentRequest,
    AtlasDeviceEnrollmentResponse,
    AtlasDraftRunRequest,
    AtlasRunResponse,
)
from app.contracts import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    ChatMessage,
    DeviceEnrollmentRequest,
    Timings,
    VoiceRequest,
    VoiceResponse,
)
from app.lesson_pipeline import LessonPipelineError, analyze_and_store, build_lesson_context, fetch_recent_weaknesses
from app.nvidia import NvidiaClient, NvidiaError
from app.piper_tts import PiperTTSClient
from app.voice_policy import VoicePolicyError, build_system_message
from app.supabase_auth import SupabaseDeviceRegistry

logger = logging.getLogger(__name__)

# Personas that consult the weakness-detection pipeline for per-user lesson
# context. Deliberately NOT every persona: Translator must stay literal
# translation-only (see the Live Translator scope decision in
# docs/HANDOFF-alphonso-language-companion.md), and the business personas
# (alphonso, jose, ...) have nothing to do with language learning -- injecting
# a stranger's learner-weakness data into their prompt would be a real
# correctness bug, not a harmless no-op.
_LESSON_CONTEXT_AGENTS = frozenset({"tutor"})

# Per-session cache for lesson context, so a multi-turn Tutor conversation
# fetches it from Supabase once, not on every single turn. Latency is the
# single biggest measured risk for this whole voice product (see
# docs/HANDOFF-alphonso-language-companion.md) -- adding an extra
# synchronous round trip to every turn would work against that directly.
# Process-local and best-effort: a cache miss (different worker, TTL expiry,
# process restart) just re-fetches, it never breaks correctness, only saves
# a round trip when it hits. `analyze_session` evicts a session's entry
# immediately once that session ends, since the cached context is stale the
# moment new weaknesses might have been recorded for it.
_LESSON_CONTEXT_CACHE_TTL_SECONDS = 900.0  # ~15 min: comfortably longer than a typical Tutor turn gap
_LESSON_CONTEXT_CACHE_MAX_ENTRIES = 2_000  # bounds memory on a long-lived process with many short sessions
_lesson_context_cache: dict[str, tuple[str | None, float]] = {}


def _lesson_context_cache_get(session_id: str) -> tuple[bool, str | None]:
    entry = _lesson_context_cache.get(session_id)
    if entry is None:
        return False, None
    context, cached_at = entry
    if time.time() - cached_at > _LESSON_CONTEXT_CACHE_TTL_SECONDS:
        _lesson_context_cache.pop(session_id, None)
        return False, None
    return True, context


def _lesson_context_cache_set(session_id: str, context: str | None) -> None:
    if len(_lesson_context_cache) >= _LESSON_CONTEXT_CACHE_MAX_ENTRIES and session_id not in _lesson_context_cache:
        # Simple bound, not true LRU: evict one arbitrary (oldest-inserted,
        # since dicts preserve insertion order) entry rather than let this
        # grow unboundedly. Good enough for a best-effort cache where a wrong
        # eviction just costs one extra fetch, never a correctness bug.
        _lesson_context_cache.pop(next(iter(_lesson_context_cache)), None)
    _lesson_context_cache[session_id] = (context, time.time())

app = FastAPI(title="Alphonso Cloud Voice")
atlas_demo_control_plane = AtlasDemoControlPlane()


def _require_atlas_demo(settings: Settings, api_version: str | None) -> None:
    if not settings.atlas_control_plane_demo_mode:
        raise HTTPException(status_code=503, detail="Atlas control-plane demo mode is not enabled")
    if api_version != "v1":
        raise HTTPException(status_code=400, detail="Unsupported Atlas API version")


async def _atlas_demo_user(authorization: str | None, api_version: str | None):
    settings = Settings.from_env()
    _require_atlas_demo(settings, api_version)
    # The non-production contract is user-scoped and requires an enrolled mobile
    # device for all workspace operations. It still excludes worker dispatch,
    # connector access, and final action approval.
    return await SupabaseDeviceRegistry(settings).user_from_authorization(authorization)


async def _atlas_enrolled_user(
    authorization: str | None,
    api_version: str | None,
    device_id: str | None,
):
    user = await _atlas_demo_user(authorization, api_version)
    await atlas_demo_control_plane.require_enrolled_device(user.id, device_id)
    return user


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, object]:
    status = Settings.from_env().public_status()
    if not status["ready"]:
        raise HTTPException(status_code=503, detail=status)
    return status


@app.post("/api/v1/devices/enroll", response_model=AtlasDeviceEnrollmentResponse, status_code=201)
async def atlas_enroll_device(
    payload: AtlasDeviceEnrollmentRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AtlasDeviceEnrollmentResponse:
    if x_alphonso_device_id != payload.device_id:
        raise HTTPException(status_code=400, detail="Atlas device header does not match enrollment payload")
    user = await _atlas_demo_user(authorization, x_alphonso_api_version)
    return await atlas_demo_control_plane.enroll_device(user.id, payload)


@app.get("/api/v1/workspaces/{workspace_id}/briefing", response_model=AtlasBriefingResponse)
async def atlas_briefing(
    workspace_id: str,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AtlasBriefingResponse:
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    return await atlas_demo_control_plane.briefing(user.id, workspace_id)


@app.get(
    "/api/v1/workspaces/{workspace_id}/audit-receipts",
    response_model=list[AtlasAuditReceiptResponse],
)
async def atlas_audit_receipts(
    workspace_id: str,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> list[AtlasAuditReceiptResponse]:
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    receipts = await atlas_demo_control_plane.audit_receipts(user.id, workspace_id)
    return [AtlasAuditReceiptResponse.from_receipt(receipt) for receipt in receipts]


@app.get("/api/v1/workspaces/{workspace_id}/events")
async def atlas_workspace_events(
    workspace_id: str,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> StreamingResponse:
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    queue = await atlas_demo_control_plane.subscribe_events(user.id, workspace_id)

    async def stream_events():
        try:
            while True:
                event = await queue.get()
                yield f"id: {event.id}\nevent: {event.type}\ndata: {event.model_dump_json()}\n\n"
        finally:
            await atlas_demo_control_plane.unsubscribe_events(user.id, workspace_id, queue)

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/v1/workspaces/{workspace_id}/runs/drafts", response_model=AtlasRunResponse, status_code=201)
async def atlas_create_draft(
    workspace_id: str,
    payload: AtlasDraftRunRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AtlasRunResponse:
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    return await atlas_demo_control_plane.create_draft(user.id, workspace_id, payload)


@app.post("/api/v1/workspaces/{workspace_id}/decisions/{decision_id}/reviews", response_model=AtlasDecisionResponse)
async def atlas_record_decision_review(
    workspace_id: str,
    decision_id: str,
    payload: AtlasDecisionReviewRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AtlasDecisionResponse:
    del payload
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    return await atlas_demo_control_plane.record_review(
        user.id,
        workspace_id,
        decision_id,
        x_alphonso_device_id or "",
    )


@app.post(
    "/api/v1/workspaces/{workspace_id}/decisions/{decision_id}/action-challenges",
    response_model=AtlasActionChallengeResponse,
)
async def atlas_issue_action_challenge(
    workspace_id: str,
    decision_id: str,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AtlasActionChallengeResponse:
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    return await atlas_demo_control_plane.issue_action_challenge(
        user.id,
        workspace_id,
        decision_id,
        x_alphonso_device_id or "",
    )


@app.post(
    "/api/v1/workspaces/{workspace_id}/decisions/{decision_id}/action-confirmations",
    response_model=AtlasDecisionActionConfirmationResponse,
)
async def atlas_confirm_action_challenge(
    workspace_id: str,
    decision_id: str,
    payload: AtlasDecisionActionConfirmationRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AtlasDecisionActionConfirmationResponse:
    user = await _atlas_enrolled_user(authorization, x_alphonso_api_version, x_alphonso_device_id)
    return await atlas_demo_control_plane.confirm_action_challenge(
        user.id,
        workspace_id,
        decision_id,
        x_alphonso_device_id or "",
        payload,
    )


@app.post("/v1/voice/devices/enroll")
async def enroll_device(payload: DeviceEnrollmentRequest, authorization: str | None = Header(default=None)) -> dict[str, str]:
    settings = Settings.from_env()
    registry = SupabaseDeviceRegistry(settings)
    user = await registry.user_from_authorization(authorization)
    await registry.enroll(user, payload.device_id, payload.display_name)
    return {"status": "enrolled", "device_id": payload.device_id}


async def _tutor_lesson_context(settings: Settings, user, language: str) -> str | None:
    """
    Fetch this learner's recent weaknesses and fold them into lesson context.

    Best-effort only: a Supabase hiccup here must never break an otherwise-
    healthy voice reply, so failures are logged and treated as "no context"
    rather than propagated. The Tutor persona works fine without lesson
    context (it just won't reference past mistakes yet) -- it should never be
    the reason a real conversation turn fails.
    """
    try:
        weaknesses = await fetch_recent_weaknesses(settings, user, language)
    except LessonPipelineError as error:
        logger.error("Could not fetch lesson context for Tutor persona: %s", error)
        return None
    return build_lesson_context(weaknesses)


@app.post("/v1/voice/respond", response_model=VoiceResponse)
async def respond(payload: VoiceRequest, authorization: str | None = Header(default=None), x_alphonso_device_id: str | None = Header(default=None)) -> VoiceResponse:
    settings = Settings.from_env()
    if not settings.is_ready:
        logger.error("Cloud voice service not configured: %s", settings.public_status())
        raise HTTPException(status_code=503, detail="Cloud voice service is not configured")
    user = await SupabaseDeviceRegistry(settings).require_active_device(authorization, x_alphonso_device_id)
    client = NvidiaClient(settings)
    started = time.perf_counter()
    try:
        lesson_context = None
        if payload.agent_id in _LESSON_CONTEXT_AGENTS:
            cache_hit, cached_context = _lesson_context_cache_get(payload.session_id)
            if cache_hit:
                lesson_context = cached_context
            else:
                lesson_context = await _tutor_lesson_context(settings, user, payload.language)
                _lesson_context_cache_set(payload.session_id, lesson_context)
        messages = [
            {"role": "system", "content": build_system_message(payload.agent_id, payload.language, lesson_context)},
            *[message.model_dump() for message in payload.history],
            ChatMessage(role="user", content=payload.text).model_dump(),
        ]
        reply = await client.complete(messages)
        llm_ms = int((time.perf_counter() - started) * 1000)
        if payload.language == "fa-IR":
            audio = await PiperTTSClient(settings).synthesize(reply, payload.piper_voice)
            tts_provider = "piper"
        else:
            audio = await client.synthesize(reply, payload.language, payload.tts_model)
            tts_provider = "nvidia"
    except (NvidiaError, VoicePolicyError) as error:
        raise HTTPException(status_code=error.status_code, detail=error.safe_message) from error
    total_ms = int((time.perf_counter() - started) * 1000)
    return VoiceResponse(request_id=str(uuid4()), session_id=payload.session_id, agent=payload.agent_id, reply=reply, audio_base64=base64.b64encode(audio).decode("ascii"), tts_model=payload.tts_model, tts_provider=tts_provider, language=payload.language, timings_ms=Timings(llm=llm_ms, tts=total_ms - llm_ms, total=total_ms))


@app.post("/v1/voice/sessions/analyze", response_model=AnalyzeTranscriptResponse)
async def analyze_session(
    payload: AnalyzeTranscriptRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_device_id: str | None = Header(default=None),
) -> AnalyzeTranscriptResponse:
    """
    Run the offline weakness-detection pipeline for one completed session.

    The client calls this once, when a Live Tutor (or Translator, for the
    learner's own side of a translated exchange) session ends -- not from the
    real-time /v1/voice/respond path. Not latency-critical: this may take
    several seconds (a real NVIDIA NIM call over the whole transcript), which
    is fine because nothing is waiting on it synchronously.
    """
    settings = Settings.from_env()
    if not settings.is_ready:
        logger.error("Cloud voice service not configured: %s", settings.public_status())
        raise HTTPException(status_code=503, detail="Cloud voice service is not configured")
    user = await SupabaseDeviceRegistry(settings).require_active_device(authorization, x_alphonso_device_id)
    # This session's cached lesson context (if any) is stale the moment new
    # weaknesses might be recorded for it -- evict unconditionally, before
    # the analysis even runs, so a failure below can't leave a stale hit
    # behind.
    _lesson_context_cache.pop(payload.session_id, None)
    try:
        weaknesses = await analyze_and_store(settings, user, payload.session_id, payload.transcript, payload.language)
    except (NvidiaError, LessonPipelineError) as error:
        raise HTTPException(status_code=error.status_code, detail=error.safe_message) from error
    return AnalyzeTranscriptResponse(
        session_id=payload.session_id,
        weaknesses_found=len(weaknesses),
        weaknesses_stored=len(weaknesses),
    )
