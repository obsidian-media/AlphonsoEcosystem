import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

_MOCK_TOKEN = "a1b2c3d4e5f67890a1b2c3d4e5f67890"  # nosec B105 — test fixture, not a real credential


def test_local_backend_does_not_expose_cloud_voice_route():
    from main import app

    response = TestClient(app).post(
        "/voice/respond",
        json={"session_id": "s1", "text": "hello"},
    )

    assert response.status_code == 404


def test_local_backend_disables_credentials_for_wildcard_cors():
    from main import app

    cors = next(middleware for middleware in app.user_middleware if middleware.cls.__name__ == "CORSMiddleware")

    assert cors.kwargs["allow_origins"] == ["*"]
    assert cors.kwargs["allow_credentials"] is False


def test_local_health_reports_ollama_configuration():
    from main import app

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert "ollama" in payload
    assert "url" in payload["ollama"]
    assert "reachable" in payload["ollama"]
    assert isinstance(payload["stt"], bool)
    assert isinstance(payload["tts"], bool)


# ---------------------------------------------------------------------------
# WebSocket token authentication
# ---------------------------------------------------------------------------

def test_ws_rejects_missing_token():
    """Endpoint closes with 1008 Policy Violation when no token query param is present."""
    import main as main_module
    from main import app
    with patch.object(main_module, "_VOICE_TOKEN", _MOCK_TOKEN):
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with TestClient(app).websocket_connect("/ws") as ws:
                ws.receive_text()
    assert exc_info.value.code == 1008


def test_ws_rejects_wrong_token():
    """Endpoint closes with 1008 Policy Violation when an incorrect token is supplied."""
    import main as main_module
    from main import app
    with patch.object(main_module, "_VOICE_TOKEN", _MOCK_TOKEN):
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with TestClient(app).websocket_connect("/ws?token=bad-token") as ws:
                ws.receive_text()
    assert exc_info.value.code == 1008


def test_ws_accepts_valid_token():
    """Endpoint accepts the connection and processes the reset control message."""
    import main as main_module
    from main import app
    with patch.object(main_module, "_VOICE_TOKEN", _MOCK_TOKEN):
        with TestClient(app).websocket_connect(f"/ws?token={_MOCK_TOKEN}") as ws:
            ws.send_json({"type": "reset"})
            data = ws.receive_json()
    assert data["type"] == "state"
    assert data["value"] == "idle"
