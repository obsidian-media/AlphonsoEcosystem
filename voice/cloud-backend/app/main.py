from __future__ import annotations

import base64
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
from app.contracts import ChatMessage, DeviceEnrollmentRequest, Timings, VoiceRequest, VoiceResponse
from app.nvidia import NvidiaClient, NvidiaError
from app.piper_tts import PiperTTSClient
from app.voice_policy import VoicePolicyError, build_system_message
from app.supabase_auth import SupabaseDeviceRegistry

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


@app.post("/v1/voice/respond", response_model=VoiceResponse)
async def respond(payload: VoiceRequest, authorization: str | None = Header(default=None), x_alphonso_device_id: str | None = Header(default=None)) -> VoiceResponse:
    settings = Settings.from_env()
    if not settings.is_ready:
        raise HTTPException(status_code=503, detail="Cloud voice service is not configured")
    await SupabaseDeviceRegistry(settings).require_active_device(authorization, x_alphonso_device_id)
    client = NvidiaClient(settings)
    started = time.perf_counter()
    try:
        messages = [
            {"role": "system", "content": build_system_message(payload.agent_id, payload.language)},
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
