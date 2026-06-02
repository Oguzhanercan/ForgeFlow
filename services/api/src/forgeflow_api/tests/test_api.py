from fastapi.testclient import TestClient

from forgeflow_api.core.dependencies import build_container
from forgeflow_api.main import create_app


def test_chat_message_creates_run_and_emits_session_event():
    client = TestClient(create_app())

    session = client.post("/chat/sessions", json={"title": "ForgeFlow Session"}).json()
    response = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Generate a 3d ceremonial shield with two concept variants.", "role": "user"},
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["run"]["intent_type"] == "image_plus_3d"

    events = client.get(f"/chat/sessions/{session['id']}/events").json()
    assert any(event["type"] == "run.created" for event in events["events"])
    assert any(event["type"] == "message.created" for event in events["events"])


def test_chat_events_support_sse_accept_header():
    client = TestClient(create_app())

    session = client.post("/chat/sessions", json={"title": "ForgeFlow SSE"}).json()
    client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Generate one image.", "role": "user"},
    )

    response = client.get(
        f"/chat/sessions/{session['id']}/events",
        headers={"accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "event: run.created" in response.text


def test_registering_nvidia_provider_via_api_wires_adapter_and_healthcheck(tmp_path, monkeypatch):
    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    provider = client.post(
        "/providers/register",
        json={"model_ref": "moonshotai/kimi-k2.5", "provider_kind": "nvidia"},
    ).json()

    assert provider["capabilities"] == ["planner_text", "text_chat", "vision_review"]

    health = client.post(
        "/providers/test",
        json={"provider_id": provider["id"], "capability": "text_chat"},
    )

    assert health.status_code == 200
    assert health.json()["ok"] is True


def test_upload_asset_creates_session_artifact(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Uploads"}).json()
    response = client.post(
        "/assets/upload",
        data={"session_id": session["id"], "title": "reference shield"},
        files={"file": ("shield.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["artifact"]["session_id"] == session["id"]
    assert payload["artifact"]["kind"] == "raw_image"
    assert payload["artifact"]["stage"] == "upload"

    bundle = client.get(f"/chat/sessions/{session['id']}").json()
    assert any(artifact["id"] == payload["artifact"]["id"] for artifact in bundle["artifacts"])


def test_get_asset_returns_artifact_metadata(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Asset Lookup"}).json()
    upload = client.post(
        "/assets/upload",
        data={"session_id": session["id"], "title": "lookup shield"},
        files={"file": ("shield.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    ).json()

    response = client.get(f"/assets/{upload['artifact']['id']}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == upload["artifact"]["id"]
    assert payload["title"] == "lookup shield"
    assert payload["session_id"] == session["id"]
    assert payload["kind"] == "raw_image"


def test_get_asset_returns_404_for_unknown_asset(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    response = client.get("/assets/asset_missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "asset not found"


def test_provider_status_can_be_toggled_and_disabled_provider_is_excluded_from_capability_selection(tmp_path, monkeypatch):
    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    provider = client.post(
        "/providers/register",
        json={"model_ref": "moonshotai/kimi-k2.5", "provider_kind": "nvidia"},
    ).json()

    disable_response = client.post(
        f"/providers/{provider['id']}/status",
        json={"status": "disabled"},
    )

    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"
    assert container.provider_registry.find_by_capability("text_chat") == []

    enable_response = client.post(
        f"/providers/{provider['id']}/status",
        json={"status": "active"},
    )

    assert enable_response.status_code == 200
    assert enable_response.json()["status"] == "active"
    assert [item.id for item in container.provider_registry.find_by_capability("text_chat")] == [provider["id"]]


def test_provider_catalog_endpoint_returns_model_presets(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    response = client.get("/providers/catalog")

    assert response.status_code == 200
    catalog = response.json()
    refs = {entry["normalized_id"] for entry in catalog}
    assert "black-forest-labs/FLUX.2-klein-4B" in refs
    assert "Qwen/Qwen3-32B-Instruct" in refs
    flux = next(entry for entry in catalog if entry["normalized_id"] == "black-forest-labs/FLUX.2-klein-4B")
    assert flux["metadata"]["local_profile"]["fits_rtx_3090"] is True


def test_default_cors_allows_custom_dev_web_port(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    response = client.get("/providers/catalog", headers={"origin": "http://127.0.0.1:3333"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3333"


def test_session_can_be_renamed_and_archived_via_api(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Workspace 01", "metadata": {"workspace_id": "ws_main"}}).json()

    response = client.patch(
        f"/chat/sessions/{session['id']}",
        json={"title": "Ottoman Concepts", "metadata": {"archived": True}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Ottoman Concepts"
    assert payload["metadata"]["workspace_id"] == "ws_main"
    assert payload["metadata"]["archived"] is True


def test_session_can_be_deleted_via_api(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Delete Me"}).json()

    response = client.delete(f"/chat/sessions/{session['id']}")

    assert response.status_code == 204
    bundle = client.get(f"/chat/sessions/{session['id']}")
    assert bundle.status_code == 404


def test_default_workspace_session_is_auto_named_after_multiple_messages(tmp_path):
    container = build_container(data_root=tmp_path, start_worker=False, register_defaults=False)
    client = TestClient(create_app(container=container))

    session = client.post(
        "/chat/sessions",
        json={"title": "Workspace 10", "metadata": {"workspace_id": "ws_main"}},
    ).json()

    client.post(f"/chat/sessions/{session['id']}/messages", json={"content": "merhaba", "role": "user"})
    client.post(f"/chat/sessions/{session['id']}/messages", json={"content": "bir kale konsepti üret", "role": "user"})
    client.post(f"/chat/sessions/{session['id']}/messages", json={"content": "osmanlı temalı olsun", "role": "user"})

    refreshed = client.get(f"/chat/sessions/{session['id']}").json()["session"]
    assert refreshed["title"] != "Workspace 10"
    assert refreshed["metadata"]["auto_named"] is True
