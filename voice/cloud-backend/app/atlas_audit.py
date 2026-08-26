"""Atlas audit persistence boundary.

The default adapter is intentionally in-memory and is only suitable for the explicitly
non-production demo mode. The protocol and Supabase migration establish the contract for
a durable production adapter without allowing application code to silently bypass audit
receipt creation.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import uuid4


AtlasAuditEventType = Literal["review_recorded", "challenge_issued", "confirmation_recorded"]


@dataclass(frozen=True)
class AtlasAuditReceipt:
    id: str
    workspace_id: str
    decision_id: str | None
    challenge_id: str | None
    actor_user_id: str
    device_id: str | None
    event_type: AtlasAuditEventType
    execution_status: Literal["not_executed"]
    correlation_id: str
    payload: dict[str, object]
    occurred_at: datetime


class AtlasAuditRepository(Protocol):
    async def append(
        self,
        *,
        workspace_id: str,
        decision_id: str | None,
        challenge_id: str | None,
        actor_user_id: str,
        device_id: str | None,
        event_type: AtlasAuditEventType,
        payload: dict[str, object],
        receipt_id: str | None = None,
        correlation_id: str | None = None,
    ) -> AtlasAuditReceipt: ...

    async def list_for_workspace(self, workspace_id: str, actor_user_id: str) -> list[AtlasAuditReceipt]: ...

    async def reset_for_tests(self) -> None: ...


class InMemoryAtlasAuditRepository:
    """A deterministic demo adapter. It must not be enabled in production."""

    def __init__(self) -> None:
        self._receipts: list[AtlasAuditReceipt] = []
        self._lock = asyncio.Lock()

    async def append(
        self,
        *,
        workspace_id: str,
        decision_id: str | None,
        challenge_id: str | None,
        actor_user_id: str,
        device_id: str | None,
        event_type: AtlasAuditEventType,
        payload: dict[str, object],
        receipt_id: str | None = None,
        correlation_id: str | None = None,
    ) -> AtlasAuditReceipt:
        receipt = AtlasAuditReceipt(
            id=receipt_id or f"audit-{uuid4()}",
            workspace_id=workspace_id,
            decision_id=decision_id,
            challenge_id=challenge_id,
            actor_user_id=actor_user_id,
            device_id=device_id,
            event_type=event_type,
            execution_status="not_executed",
            correlation_id=correlation_id or str(uuid4()),
            payload=dict(payload),
            occurred_at=datetime.now(UTC),
        )
        async with self._lock:
            self._receipts.append(receipt)
        return receipt

    async def list_for_workspace(self, workspace_id: str, actor_user_id: str) -> list[AtlasAuditReceipt]:
        async with self._lock:
            return [
                receipt
                for receipt in reversed(self._receipts)
                if receipt.workspace_id == workspace_id and receipt.actor_user_id == actor_user_id
            ]

    async def reset_for_tests(self) -> None:
        async with self._lock:
            self._receipts.clear()
