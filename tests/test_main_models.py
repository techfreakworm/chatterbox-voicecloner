from fastapi.testclient import TestClient

from server.main import build_app


def test_models_list_returns_registered(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    with TestClient(app) as client:
        r = client.get("/api/models")
    assert r.status_code == 200
    items = r.json()
    ids = sorted(m["id"] for m in items)
    assert ids == ["fake", "fake-b"]
    fake = next(m for m in items if m["id"] == "fake")
    assert fake["paralinguistic_tags"] == ["[laugh]"]
    assert fake["params"][0]["name"] == "t"


def test_active_model_initially_idle(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    with TestClient(app) as client:
        r = client.get("/api/models/active")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] is None
    assert body["status"] == "idle"
