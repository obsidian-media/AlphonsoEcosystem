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

from app.atlas_audit import AtlasAuditReceipt, AtlasAuditRepository, InMemoryAtlasAuditRepository
from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated

WorkspaceID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
AtlasText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]
RunID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
DecisionID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
ActionChallengeID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
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
    "confirmation_recorded",
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


class AtlasWorkspaceEvent(BaseModel):
    id: str
    type: Literal["workspace.snapshot", "run.created", "decision.reviewed", "decision.confirmed"]
    workspace_id: str
    occurred_at: datetime
    briefing: AtlasBriefingResponse


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
    """A review marker. It does not issue a challenge or authorize an action."""


class AtlasActionChallengeResponse(BaseModel):
    id: str
    decision_id: str
    policy_code: str
    statement: str
    requires_local_authentication: bool
    status: Literal["pending_confirmation", "confirmed"]
    expires_at: datetime
    confirmation_receipt_id: str | None = None


class AtlasDecisionActionConfirmationRequest(BaseModel):
    challenge_id: ActionChallengeID
    local_authentication_completed: Literal[True]


class AtlasDecisionActionConfirmationResponse(BaseModel):
    receipt_id: str
    decision: AtlasDecisionResponse
    execution_status: Literal["not_executed"]


class AtlasAuditReceiptResponse(BaseModel):
    id: str
    workspace_id: str
    decision_id: str | None
    challenge_id: str | None
    device_id: str | None
    event_type: Literal["review_recorded", "challenge_issued", "confirmation_recorded"]
    execution_status: Literal["not_executed"]
    correlation_id: str
    occurred_at: datetime

    @classmethod
    def from_receipt(cls, receipt: AtlasAuditReceipt) -> "AtlasAuditReceiptResponse":
        return cls(
            id=receipt.id,
            workspace_id=receipt.workspace_id,
            decision_id=receipt.decision_id,
            challenge_id=receipt.challenge_id,
            device_id=receipt.device_id,
            event_type=receipt.event_type,
            execution_status=receipt.execution_status,
            correlation_id=receipt.correlation_id,
            occurred_at=receipt.occurred_at,
        )


class AtlasDemoControlPlane:
    """Ephemeral user-scoped control-plane data for non-production mobile integration."""

    def __init__(self, audit_repository: AtlasAuditRepository | None = None) -> None:
        self._workspaces_by_user: dict[str, dict[str, object]] = {}
        self._audit_repository = audit_repository or InMemoryAtlasAuditRepository()
        self._devices_by_user: dict[str, dict[str, str]] = {}
        self._event_subscribers: dict[str, set[asyncio.Queue[AtlasWorkspaceEvent]]] = {}
        self._event_sequence = 0
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
            workspace["runs"].insert(0, run)
        await self._publish_event(user_id, workspace_id, workspace, "run.created")
        return run

    async def record_review(
        self,
        user_id: str,
        workspace_id: str,
        decision_id: str,
        device_id: str | None = None,
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
                break
            else:
                raise HTTPException(status_code=404, detail="Decision record is unavailable")
        await self._audit_repository.append(
            workspace_id=workspace_id,
            decision_id=recorded.id,
            challenge_id=None,
            actor_user_id=user_id,
            device_id=device_id,
            event_type="review_recorded",
            payload={"policy_code": recorded.policy_code, "decision_state": recorded.state},
        )
        await self._publish_event(user_id, workspace_id, workspace, "decision.reviewed")
        return recorded

    async def issue_action_challenge(
        self,
        user_id: str,
        workspace_id: str,
        decision_id: str,
        device_id: str,
    ) -> AtlasActionChallengeResponse:
        workspace = await self._workspace_for(user_id, workspace_id)
        now = _utc_now()
        async with self._lock:
            decisions: list[AtlasDecisionResponse] = workspace["decisions"]
            decision = next((item for item in decisions if item.id == decision_id), None)
            if decision is None:
                raise HTTPException(status_code=404, detail="Decision record is unavailable")
            if decision.state != "review_recorded_pending_confirmation":
                raise HTTPException(status_code=409, detail="Record review before requesting an action challenge")
            if decision.expires_at <= now:
                raise HTTPException(status_code=409, detail="This decision has expired")

            challenges: dict[str, dict[str, object]] = workspace["challenges"]
            for stored in challenges.values():
                challenge: AtlasActionChallengeResponse = stored["challenge"]
                if (
                    challenge.decision_id == decision_id
                    and stored["device_id"] == device_id
                    and challenge.status == "pending_confirmation"
                    and challenge.expires_at > now
                ):
                    return challenge

            challenge = AtlasActionChallengeResponse(
                id=f"challenge-{uuid4()}",
                decision_id=decision.id,
                policy_code=decision.policy_code,
                statement=f"Confirm your reviewed decision for {decision.title}. This records intent only; it does not execute an action.",
                requires_local_authentication=decision.risk == "high",
                status="pending_confirmation",
                expires_at=min(decision.expires_at, now + timedelta(minutes=5)),
            )
            challenges[challenge.id] = {"device_id": device_id, "challenge": challenge}
        await self._audit_repository.append(
            workspace_id=workspace_id,
            decision_id=decision.id,
            challenge_id=challenge.id,
            actor_user_id=user_id,
            device_id=device_id,
            event_type="challenge_issued",
            payload={"policy_code": challenge.policy_code, "expires_at": challenge.expires_at.isoformat()},
        )
        return challenge

    async def confirm_action_challenge(
        self,
        user_id: str,
        workspace_id: str,
        decision_id: str,
        device_id: str,
        payload: AtlasDecisionActionConfirmationRequest,
    ) -> AtlasDecisionActionConfirmationResponse:
        workspace = await self._workspace_for(user_id, workspace_id)
        now = _utc_now()
        async with self._lock:
            challenges: dict[str, dict[str, object]] = workspace["challenges"]
            stored = challenges.get(payload.challenge_id)
            if stored is None:
                raise HTTPException(status_code=404, detail="Action challenge is unavailable")
            if stored["device_id"] != device_id:
                raise HTTPException(status_code=403, detail="Action challenge belongs to a different device")
            challenge: AtlasActionChallengeResponse = stored["challenge"]
            if challenge.decision_id != decision_id:
                raise HTTPException(status_code=409, detail="Action challenge does not match this decision")
            if challenge.status != "pending_confirmation":
                raise HTTPException(status_code=409, detail="Action challenge has already been confirmed")
            if challenge.expires_at <= now:
                raise HTTPException(status_code=409, detail="Action challenge has expired")

            decisions: list[AtlasDecisionResponse] = workspace["decisions"]
            for index, decision in enumerate(decisions):
                if decision.id != decision_id:
                    continue
                if decision.state != "review_recorded_pending_confirmation":
                    raise HTTPException(status_code=409, detail="Decision is not ready for confirmation")
                confirmed_decision = decision.model_copy(update={"state": "confirmation_recorded"})
                decisions[index] = confirmed_decision
                break
            else:
                raise HTTPException(status_code=404, detail="Decision record is unavailable")

            receipt_id = f"receipt-{uuid4()}"
            stored["challenge"] = challenge.model_copy(
                update={"status": "confirmed", "confirmation_receipt_id": receipt_id}
            )
        await self._audit_repository.append(
            workspace_id=workspace_id,
            decision_id=confirmed_decision.id,
            challenge_id=payload.challenge_id,
            actor_user_id=user_id,
            device_id=device_id,
            event_type="confirmation_recorded",
            payload={"decision_state": confirmed_decision.state, "execution_status": "not_executed"},
            receipt_id=receipt_id,
        )
        await self._publish_event(user_id, workspace_id, workspace, "decision.confirmed")
        return AtlasDecisionActionConfirmationResponse(
            receipt_id=receipt_id,
            decision=confirmed_decision,
            execution_status="not_executed",
        )

    async def subscribe_events(
        self,
        user_id: str,
        workspace_id: str,
    ) -> asyncio.Queue[AtlasWorkspaceEvent]:
        workspace = await self._workspace_for(user_id, workspace_id)
        queue: asyncio.Queue[AtlasWorkspaceEvent] = asyncio.Queue(maxsize=16)
        key = self._workspace_key(user_id, workspace_id)
        async with self._lock:
            self._event_subscribers.setdefault(key, set()).add(queue)
            queue.put_nowait(self._new_event(workspace_id, workspace, "workspace.snapshot"))
        return queue

    async def unsubscribe_events(
        self,
        user_id: str,
        workspace_id: str,
        queue: asyncio.Queue[AtlasWorkspaceEvent],
    ) -> None:
        key = self._workspace_key(user_id, workspace_id)
        async with self._lock:
            subscribers = self._event_subscribers.get(key)
            if not subscribers:
                return
            subscribers.discard(queue)
            if not subscribers:
                self._event_subscribers.pop(key, None)

    async def audit_receipts(self, user_id: str, workspace_id: str) -> list[AtlasAuditReceipt]:
        await self._workspace_for(user_id, workspace_id)
        return await self._audit_repository.list_for_workspace(workspace_id, user_id)

    async def reset_for_tests(self) -> None:
        async with self._lock:
            self._workspaces_by_user.clear()
            self._devices_by_user.clear()
            self._event_subscribers.clear()
            self._event_sequence = 0
        await self._audit_repository.reset_for_tests()

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

    async def _publish_event(
        self,
        user_id: str,
        workspace_id: str,
        workspace: dict[str, object],
        event_type: Literal["run.created", "decision.reviewed", "decision.confirmed"],
    ) -> None:
        key = self._workspace_key(user_id, workspace_id)
        async with self._lock:
            event = self._new_event(workspace_id, workspace, event_type)
            for queue in self._event_subscribers.get(key, set()).copy():
                if queue.full():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                queue.put_nowait(event)

    @staticmethod
    def _workspace_key(user_id: str, workspace_id: str) -> str:
        return f"{user_id}:{workspace_id}"

    def _new_event(
        self,
        workspace_id: str,
        workspace: dict[str, object],
        event_type: Literal["workspace.snapshot", "run.created", "decision.reviewed", "decision.confirmed"],
    ) -> AtlasWorkspaceEvent:
        self._event_sequence += 1
        return AtlasWorkspaceEvent(
            id=str(self._event_sequence),
            type=event_type,
            workspace_id=workspace_id,
            occurred_at=_utc_now(),
            briefing=self._briefing_response(workspace),
        )

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
        "challenges": {},
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
