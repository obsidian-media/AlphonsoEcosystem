from fastapi.testclient import TestClient


def test_local_backend_does_not_expose_cloud_voice_route():
    from main import app

    response = TestClient(app).post(
        "/voice/respond",
        json={"session_id": "s1", "text": "hello"},
    )

    assert response.status_code == 404


def test_local_health_reports_ollama_configuration():
    from main import app

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert "ollama" in payload
    assert "url" in payload["ollama"]
    assert "reachable" in payload["ollama"]
