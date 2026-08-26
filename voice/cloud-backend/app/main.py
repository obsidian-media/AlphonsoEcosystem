from __future__ import annotations

import base64
import time
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException

from app.config import Settings
from app.atlas_control_plane import (
    AtlasBriefingResponse,
    AtlasDecisionResponse,
    AtlasDecisionReviewRequest,
    AtlasDemoControlPlane,
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
    # The non-production contract is user-scoped but deliberately does not claim
    # device binding, worker dispatch, connector access, or final action approval.
    return await SupabaseDeviceRegistry(settings).user_from_authorization(authorization)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, object]:
    status = Settings.from_env().public_status()
    if not status["ready"]:
        raise HTTPException(status_code=503, detail=status)
    return status


@app.get("/api/v1/workspaces/{workspace_id}/briefing", response_model=AtlasBriefingResponse)
async def atlas_briefing(
    workspace_id: str,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
) -> AtlasBriefingResponse:
    user = await _atlas_demo_user(authorization, x_alphonso_api_version)
    return await atlas_demo_control_plane.briefing(user.id, workspace_id)


@app.post("/api/v1/workspaces/{workspace_id}/runs/drafts", response_model=AtlasRunResponse, status_code=201)
async def atlas_create_draft(
    workspace_id: str,
    payload: AtlasDraftRunRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
) -> AtlasRunResponse:
    user = await _atlas_demo_user(authorization, x_alphonso_api_version)
    return await atlas_demo_control_plane.create_draft(user.id, workspace_id, payload)


@app.post("/api/v1/workspaces/{workspace_id}/decisions/{decision_id}/reviews", response_model=AtlasDecisionResponse)
async def atlas_record_decision_review(
    workspace_id: str,
    decision_id: str,
    payload: AtlasDecisionReviewRequest,
    authorization: str | None = Header(default=None),
    x_alphonso_api_version: str | None = Header(default=None),
) -> AtlasDecisionResponse:
    del payload  # Reserved for a future server-issued action-challenge receipt.
    user = await _atlas_demo_user(authorization, x_alphonso_api_version)
    return await atlas_demo_control_plane.record_review(user.id, workspace_id, decision_id)


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
