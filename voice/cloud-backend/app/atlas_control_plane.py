"""Non-production Atlas control-plane state and v1 response contracts.

This module deliberately contains no desktop command execution, connector secrets, or
worker dispatch. It is an ephemeral, user-scoped contract server for mobile integration
work. Production persistence, authorization scopes, action challenges, and audit receipts
must replace this module before a production deployment.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated

WorkspaceID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
AtlasText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]
RunID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
DecisionID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
ExecutionPosture = Literal["cloud", "hybrid", "local", "on_device"]
RunPhase = Literal[
    "planned",
    "awaiting_approval",
    "queued",
    "executing",
    "waiting_on_dependency",
    "succeeded",
    "failed",
    "cancelled",
]
DecisionRisk = Literal["routine", "elevated", "high"]
DecisionState = Literal[
    "awaiting_review",
    "review_recorded_pending_confirmation",
    "approved",
    "rejected",
    "expired",
    "unavailable",
]


class AtlasWorkspaceResponse(BaseModel):
    id: str
    name: str
    posture: ExecutionPosture
    member_role: str


class AtlasFreshnessResponse(BaseModel):
    state: Literal["current", "delayed", "offline"]
    minutes: int | None = Field(default=None, ge=0)
    last_confirmed_at: datetime | None = None


class AtlasRunResponse(BaseModel):
    id: str
    title: str
    summary: str
    owner: str
    phase: RunPhase
    posture: ExecutionPosture
    updated_at: datetime
    trace_id: str


class AtlasOutcomeResponse(BaseModel):
    id: str
    title: str
    detail: str
    completed_at: datetime
    trace_id: str


class AtlasDecisionResponse(BaseModel):
    id: str
    title: str
    summary: str
    affected_resource: str
    execution_detail: str
    policy_code: str
    policy_reason: str
    evidence_summary: str
    risk: DecisionRisk
    state: DecisionState
    expires_at: datetime
    run_id: str


class AtlasBriefingResponse(BaseModel):
    workspace: AtlasWorkspaceResponse
    freshness: AtlasFreshnessResponse
    active_runs: list[AtlasRunResponse]
    outcomes: list[AtlasOutcomeResponse]
    decisions: list[AtlasDecisionResponse]
    refreshed_at: datetime


class AtlasDraftRunRequest(BaseModel):
    brief: AtlasText
    desired_outcome: AtlasText
    execution_posture: ExecutionPosture


class AtlasDeviceEnrollmentRequest(BaseModel):
    device_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=36, max_length=36)]
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class AtlasDeviceEnrollmentResponse(BaseModel):
    status: Literal["enrolled"]
    device_id: str
    device_trust: Literal["demo_enrolled"]


class AtlasDecisionReviewRequest(BaseModel):
    """Reserved for a future action-challenge receipt; body is intentionally empty today."""


class AtlasDemoControlPlane:
    """Ephemeral user-scoped control-plane data for non-production mobile integration."""

    def __init__(self) -> None:
        self._workspaces_by_user: dict[str, dict[str, object]] = {}
        self._devices_by_user: dict[str, dict[str, str]] = {}
        self._lock = asyncio.Lock()

    async def enroll_device(
        self,
        user_id: str,
        payload: AtlasDeviceEnrollmentRequest,
    ) -> AtlasDeviceEnrollmentResponse:
        try:
            UUID(payload.device_id)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid Atlas device identifier") from error
        async with self._lock:
            devices = self._devices_by_user.setdefault(user_id, {})
            devices[payload.device_id] = payload.display_name
        return AtlasDeviceEnrollmentResponse(
            status="enrolled",
            device_id=payload.device_id,
            device_trust="demo_enrolled",
        )

    async def require_enrolled_device(self, user_id: str, device_id: str | None) -> None:
        if not device_id:
            raise HTTPException(status_code=401, detail="Missing Atlas device identifier")
        try:
            UUID(device_id)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid Atlas device identifier") from error
        async with self._lock:
            if device_id not in self._devices_by_user.get(user_id, {}):
                raise HTTPException(status_code=403, detail="This device is not enrolled for Atlas Cloud")

    async def briefing(self, user_id: str, workspace_id: str) -> AtlasBriefingResponse:
        workspace = await self._workspace_for(user_id, workspace_id)
        return self._briefing_response(workspace)

    async def create_draft(
        self,
        user_id: str,
        workspace_id: str,
        payload: AtlasDraftRunRequest,
    ) -> AtlasRunResponse:
        workspace = await self._workspace_for(user_id, workspace_id)
        now = _utc_now()
        run = AtlasRunResponse(
            id=f"run-draft-{uuid4()}",
            title=payload.brief,
            summary=payload.desired_outcome,
            owner="You",
            phase="planned",
            posture=payload.execution_posture,
            updated_at=now,
            trace_id=f"DRAFT/{uuid4().hex[:8].upper()}",
        )
        async with self._lock:
            workspace["runs"].append(run)
        return run

    async def record_review(
        self,
        user_id: str,
        workspace_id: str,
        decision_id: str,
    ) -> AtlasDecisionResponse:
        workspace = await self._workspace_for(user_id, workspace_id)
        async with self._lock:
            decisions: list[AtlasDecisionResponse] = workspace["decisions"]
            for index, decision in enumerate(decisions):
                if decision.id != decision_id:
                    continue
                if decision.state != "awaiting_review":
                    raise HTTPException(status_code=409, detail="This decision cannot be reviewed in its current state")
                recorded = decision.model_copy(update={"state": "review_recorded_pending_confirmation"})
                decisions[index] = recorded
                return recorded
        raise HTTPException(status_code=404, detail="Decision record is unavailable")

    async def reset_for_tests(self) -> None:
        async with self._lock:
            self._workspaces_by_user.clear()
            self._devices_by_user.clear()

    async def _workspace_for(self, user_id: str, workspace_id: str) -> dict[str, object]:
        if workspace_id != "workspace-northstar":
            raise HTTPException(status_code=404, detail="Workspace record is unavailable")
        async with self._lock:
            key = f"{user_id}:{workspace_id}"
            workspace = self._workspaces_by_user.get(key)
            if workspace is None:
                workspace = _seed_workspace()
                self._workspaces_by_user[key] = workspace
            return workspace

    def _briefing_response(self, workspace: dict[str, object]) -> AtlasBriefingResponse:
        now = _utc_now()
        return AtlasBriefingResponse(
            workspace=workspace["workspace"],
            freshness=AtlasFreshnessResponse(state="current"),
            active_runs=workspace["runs"],
            outcomes=workspace["outcomes"],
            decisions=workspace["decisions"],
            refreshed_at=now,
        )


def _seed_workspace() -> dict[str, object]:
    now = _utc_now()
    release_run_id = "run-release-brief"
    return {
        "workspace": AtlasWorkspaceResponse(
            id="workspace-northstar",
            name="Northstar Workspace",
            posture="cloud",
            member_role="operator",
        ),
        "runs": [
            AtlasRunResponse(
                id="run-research-synthesis",
                title="Competitive research synthesis",
                summary="Evidence collection is in progress against the verified source plan.",
                owner="Hector",
                phase="executing",
                posture="cloud",
                updated_at=now - timedelta(minutes=2),
                trace_id="RUN/RS-204",
            ),
            AtlasRunResponse(
                id=release_run_id,
                title="Product launch sequence",
                summary="The prepared distribution brief is awaiting accountable review.",
                owner="Jose",
                phase="awaiting_approval",
                posture="cloud",
                updated_at=now - timedelta(minutes=4),
                trace_id="RUN/RL-018",
            ),
        ],
        "outcomes": [
            AtlasOutcomeResponse(
                id="outcome-research-archive",
                title="Research archive updated",
                detail="Nine verified findings were added to the workspace source trail.",
                completed_at=now - timedelta(minutes=28),
                trace_id="OUT/RA-009",
            )
        ],
        "decisions": [
            AtlasDecisionResponse(
                id="decision-release-brief",
                title="Approve the release brief",
                summary="The reviewed launch brief is ready to move to the distribution queue.",
                affected_resource="Northstar / Release communications",
                execution_detail="Cloud workspace · non-production distribution simulation",
                policy_code="P-017",
                policy_reason="External communication requires an accountable operator review.",
                evidence_summary="All required source claims and campaign assets passed the launch checklist. No unresolved policy exceptions are present.",
                risk="high",
                state="awaiting_review",
                expires_at=now + timedelta(minutes=18),
                run_id=release_run_id,
            )
        ],
    }


def _utc_now() -> datetime:
    return datetime.now(UTC)
