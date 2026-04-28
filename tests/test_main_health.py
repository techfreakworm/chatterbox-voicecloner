from fastapi.testclient import TestClient

from server.main import build_app


def test_health_returns_device_and_status(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    with TestClient(app) as client:
        r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["device"] == "cpu"
    assert data["model_status"] == "idle"
    assert "torch_version" in data
