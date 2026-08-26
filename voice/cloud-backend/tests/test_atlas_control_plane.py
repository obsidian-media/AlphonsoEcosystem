import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.atlas_control_plane import AtlasDemoControlPlane, AtlasDeviceEnrollmentRequest, AtlasDraftRunRequest
from app.main import app, atlas_demo_control_plane
from app.supabase_auth import SupabaseUser


ENV = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_ANON_KEY": "publishable-key",
    "ATLAS_CONTROL_PLANE_DEMO_MODE": "true",
}
DEVICE_ID = "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"
HEADERS = {
    "Authorization": "Bearer demo-user-token",
    "X-Alphonso-API-Version": "v1",
    "X-Alphonso-Device-Id": DEVICE_ID,
}
USER = SupabaseUser(id="user-mobile-test", access_token="demo-user-token")


def reset_demo_state() -> None:
    asyncio.run(atlas_demo_control_plane.reset_for_tests())


def enroll(client: TestClient) -> None:
    response = client.post(
        "/api/v1/devices/enroll",
        headers=HEADERS,
        json={"device_id": DEVICE_ID, "display_name": "Atlas iPhone"},
    )
    assert response.status_code == 201
    assert response.json() == {
        "status": "enrolled",
        "device_id": DEVICE_ID,
        "device_trust": "demo_enrolled",
    }


def test_atlas_routes_are_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ATLAS_CONTROL_PLANE_DEMO_MODE", raising=False)
    response = TestClient(app).get(
        "/api/v1/workspaces/workspace-northstar/briefing",
        headers={"X-Alphonso-API-Version": "v1"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Atlas control-plane demo mode is not enabled"


def test_atlas_briefing_requires_a_user_token():
    with patch.dict(os.environ, ENV, clear=False):
        response = TestClient(app).get(
            "/api/v1/workspaces/workspace-northstar/briefing",
            headers={"X-Alphonso-API-Version": "v1", "X-Alphonso-Device-Id": DEVICE_ID},
        )

    assert response.status_code == 401


def test_atlas_briefing_requires_v1_header():
    with patch.dict(os.environ, ENV, clear=False):
        response = TestClient(app).get(
            "/api/v1/workspaces/workspace-northstar/briefing",
            headers={"Authorization": "Bearer demo-user-token", "X-Alphonso-Device-Id": DEVICE_ID},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported Atlas API version"


def test_workspace_operations_require_enrolled_device_after_user_authentication():
    reset_demo_state()
    with patch.dict(os.environ, ENV, clear=False), patch(
        "app.main.SupabaseDeviceRegistry.user_from_authorization", new=AsyncMock(return_value=USER)
    ):
        response = TestClient(app).get(
            "/api/v1/workspaces/workspace-northstar/briefing",
            headers=HEADERS,
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "This device is not enrolled for Atlas Cloud"


def test_enrollment_rejects_header_payload_mismatch():
    reset_demo_state()
    with patch.dict(os.environ, ENV, clear=False), patch(
        "app.main.SupabaseDeviceRegistry.user_from_authorization", new=AsyncMock(return_value=USER)
    ):
        response = TestClient(app).post(
            "/api/v1/devices/enroll",
            headers=HEADERS,
            json={"device_id": "2d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8", "display_name": "Different phone"},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Atlas device header does not match enrollment payload"


def test_atlas_briefing_is_authenticated_enrolled_and_uses_mobile_contract():
    reset_demo_state()
    with patch.dict(os.environ, ENV, clear=False), patch(
        "app.main.SupabaseDeviceRegistry.user_from_authorization", new=AsyncMock(return_value=USER)
    ):
        client = TestClient(app)
        enroll(client)
        response = client.get("/api/v1/workspaces/workspace-northstar/briefing", headers=HEADERS)

    assert response.status_code == 200
    payload = response.json()
    assert payload["workspace"]["name"] == "Northstar Workspace"
    assert payload["workspace"]["posture"] == "cloud"
    assert payload["active_runs"][0]["trace_id"] == "RUN/RS-204"
    assert payload["decisions"][0]["state"] == "awaiting_review"
    assert payload["decisions"][0]["run_id"] == "run-release-brief"


def test_atlas_create_draft_is_user_scoped_and_returns_v1_run():
    reset_demo_state()
    with patch.dict(os.environ, ENV, clear=False), patch(
        "app.main.SupabaseDeviceRegistry.user_from_authorization", new=AsyncMock(return_value=USER)
    ):
        client = TestClient(app)
        enroll(client)
        response = client.post(
            "/api/v1/workspaces/workspace-northstar/runs/drafts",
            headers=HEADERS,
            json={
                "brief": "Prepare release notes",
                "desired_outcome": "A reviewed draft",
                "execution_posture": "hybrid",
            },
        )
        briefing = client.get("/api/v1/workspaces/workspace-northstar/briefing", headers=HEADERS)

    assert response.status_code == 201
    run = response.json()
    assert run["title"] == "Prepare release notes"
    assert run["phase"] == "planned"
    assert run["posture"] == "hybrid"
    assert run["trace_id"].startswith("DRAFT/")
    assert any(item["id"] == run["id"] for item in briefing.json()["active_runs"])


def test_atlas_review_is_not_final_approval_and_cannot_repeat():
    reset_demo_state()
    with patch.dict(os.environ, ENV, clear=False), patch(
        "app.main.SupabaseDeviceRegistry.user_from_authorization", new=AsyncMock(return_value=USER)
    ):
        client = TestClient(app)
        enroll(client)
        first = client.post(
            "/api/v1/workspaces/workspace-northstar/decisions/decision-release-brief/reviews",
            headers=HEADERS,
            json={},
        )
        repeated = client.post(
            "/api/v1/workspaces/workspace-northstar/decisions/decision-release-brief/reviews",
            headers=HEADERS,
            json={},
        )

    assert first.status_code == 200
    assert first.json()["state"] == "review_recorded_pending_confirmation"
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "This decision cannot be reviewed in its current state"


def test_atlas_unknown_workspace_never_creates_state():
    reset_demo_state()
    with patch.dict(os.environ, ENV, clear=False), patch(
        "app.main.SupabaseDeviceRegistry.user_from_authorization", new=AsyncMock(return_value=USER)
    ):
        client = TestClient(app)
        enroll(client)
        response = client.get("/api/v1/workspaces/unknown-workspace/briefing", headers=HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Workspace record is unavailable"


def test_atlas_event_subscription_reconciles_snapshot_and_draft_change():
    async def scenario() -> None:
        control_plane = AtlasDemoControlPlane()
        user_id = "user-event-test"
        workspace_id = "workspace-northstar"
        await control_plane.enroll_device(
            user_id,
            AtlasDeviceEnrollmentRequest(device_id=DEVICE_ID, display_name="Atlas iPhone"),
        )
        queue = await control_plane.subscribe_events(user_id, workspace_id)
        snapshot = await queue.get()
        assert snapshot.id == "1"
        assert snapshot.type == "workspace.snapshot"
        assert snapshot.briefing.workspace.id == workspace_id

        await control_plane.create_draft(
            user_id,
            workspace_id,
            AtlasDraftRunRequest(
                brief="Prepare a live update",
                desired_outcome="A synchronized draft",
                execution_posture="cloud",
            ),
        )
        created = await queue.get()
        assert created.id == "2"
        assert created.type == "run.created"
        assert created.briefing.active_runs[0].title == "Prepare a live update"

        reviewed = await control_plane.record_review(user_id, workspace_id, "decision-release-brief")
        review_event = await queue.get()
        assert reviewed.state == "review_recorded_pending_confirmation"
        assert review_event.id == "3"
        assert review_event.type == "decision.reviewed"
        assert review_event.briefing.decisions[0].state == "review_recorded_pending_confirmation"
        await control_plane.unsubscribe_events(user_id, workspace_id, queue)

    asyncio.run(scenario())


def test_non_production_control_plane_is_not_a_desktop_gateway():
    assert not hasattr(AtlasDemoControlPlane, "dispatch_command")
    assert not hasattr(AtlasDemoControlPlane, "execute_connector")
    assert not hasattr(AtlasDemoControlPlane, "approve_decision")
