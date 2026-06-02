from __future__ import annotations

from pathlib import Path

from PIL import Image
from fastapi.testclient import TestClient

from forgeflow_api.adapters.base import AdapterHealth, ImageGenerationAdapter, Object3DAdapter, TextChatAdapter, VisionReviewAdapter
from forgeflow_api.core.dependencies import build_container
from forgeflow_api.domain.models import MessageCreate, Run, SessionCreate
from forgeflow_api.main import create_app


class DummyPlannerAdapter(TextChatAdapter):
    def __init__(self) -> None:
        self.calls = 0

    def healthcheck(self) -> AdapterHealth:
        return AdapterHealth(ok=True, detail="dummy")

    def generate(self, prompt: str, system_prompt: str | None = None) -> dict:
        self.calls += 1
        return {
            "provider": "dummy",
            "model": "dummy-planner",
            "status": "ok",
            "content": '{"intent_type":"image_plus_3d","requested_outputs":["image","3d"],"grouping_strategy":"object_identity","system_prompt_profile":"single_object_image_to_3d"}',
        }


class DummyChatAdapter(TextChatAdapter):
    def healthcheck(self) -> AdapterHealth:
        return AdapterHealth(ok=True, detail="dummy-chat")

    def generate(self, prompt: str, system_prompt: str | None = None) -> dict:
        return {
            "provider": "dummy-chat",
            "model": "dummy-chat",
            "status": "ok",
            "content": f"Chat reply: {prompt}",
        }


class DummyVisionAdapter(VisionReviewAdapter):
    def healthcheck(self) -> AdapterHealth:
        return AdapterHealth(ok=True, detail="dummy")

    def review(self, image_paths: list[Path], prompt: str) -> dict:
        return {
            "status": "reviewed",
            "result": {
                "pass": True,
                "confidence": 0.91,
                "short_critique": "looks good",
            },
        }


class DummyImageAdapter(ImageGenerationAdapter):
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def healthcheck(self) -> AdapterHealth:
        return AdapterHealth(ok=True, detail="dummy")

    def generate(self, prompt: str, output_path: Path, **kwargs):
        self.calls.append({"prompt": prompt, "output_path": str(output_path), "kwargs": kwargs})
        output_path.parent.mkdir(parents=True, exist_ok=True)
        img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        for x in range(24, 72):
            for y in range(20, 76):
                img.putpixel((x, y), (10, 180, 220, 255))
        img.save(output_path)
        return {"status": "generated", "path": str(output_path), "provider": "dummy-image"}


class Dummy3DAdapter(Object3DAdapter):
    def healthcheck(self) -> AdapterHealth:
        return AdapterHealth(ok=True, detail="dummy")

    def generate(self, image_path: Path, output_dir: Path, name: str):
        output_dir.mkdir(parents=True, exist_ok=True)
        initial_path = output_dir / f"{name}_initial.glb"
        final_path = output_dir / f"{name}.glb"
        initial_path.write_bytes(b"glTF")
        final_path.write_bytes(b"glTF-final")
        return {
            "status": "generated",
            "initial_glb": str(initial_path),
            "asset_path": str(final_path),
        }


def _build_test_container(tmp_path: Path):
    container = build_container(
        data_root=tmp_path,
        start_worker=False,
        register_defaults=False,
    )
    planner_provider = container.provider_registry.register_huggingface_model("google/gemma-4-E4B-it")
    image_provider = container.provider_registry.register_huggingface_model("/tmp/fake-flux")
    object_provider = container.provider_registry.register_huggingface_model("/tmp/fake-hunyuan3d")
    planner_provider.capabilities = ["planner_text", "text_chat", "vision_review"]
    image_provider.capabilities = ["image_generation", "image_editing"]
    object_provider.capabilities = ["object3d_generation"]
    container.store.upsert_provider(planner_provider)
    container.store.upsert_provider(image_provider)
    container.store.upsert_provider(object_provider)
    planner_adapter = DummyPlannerAdapter()
    chat_adapter = DummyChatAdapter()
    container.adapter_manager.register(planner_provider.id, planner_adapter)
    container.adapter_manager.register(f"{planner_provider.id}:text_chat", chat_adapter)
    image_adapter = DummyImageAdapter()
    container.adapter_manager.register(image_provider.id, image_adapter)
    container.adapter_manager.register(f"{image_provider.id}:image_generation", image_adapter)
    container.adapter_manager.register(f"{image_provider.id}:image_editing", image_adapter)
    container.adapter_manager.register(object_provider.id, Dummy3DAdapter())
    container.adapter_manager.register(f"{planner_provider.id}:vision_review", DummyVisionAdapter())
    container.planner.text_adapter = planner_adapter
    container.test_image_adapter = image_adapter
    return container


def test_default_registration_uses_nvidia_when_enabled(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    monkeypatch.setenv("FORGEFLOW_DEFAULT_PROVIDER_STACK", "nvidia")

    container = build_container(
        data_root=tmp_path,
        start_worker=False,
        register_defaults=True,
    )

    providers = container.provider_registry.list_models()
    planner = next(provider for provider in providers if "planner_text" in provider.capabilities)
    image = next(
        provider
        for provider in providers
        if "image_generation" in provider.capabilities and provider.metadata["registration_kind"] == "nvidia_build"
    )
    local_image_edit = next(
        provider
        for provider in providers
        if "image_editing" in provider.capabilities and provider.source_kind == "local_hf_diffusers"
    )
    object3d = next(provider for provider in providers if "object3d_generation" in provider.capabilities)

    assert planner.metadata["registration_kind"] == "nvidia_build"
    assert "vision_review" in planner.capabilities
    assert image.metadata["registration_kind"] == "nvidia_build"
    assert "image_editing" in image.capabilities
    assert local_image_edit.source_kind == "local_hf_diffusers"
    assert object3d.source_kind == "local_custom"
    assert container.pipeline_engine._select_provider("image_editing").source_kind == "local_hf_diffusers"
    assert container.pipeline_engine._select_provider("object3d_generation").source_kind == "local_custom"


def test_worker_processes_run_and_persists_artifacts(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Processing"))
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(
            role="user",
            content="Generate a 3d ceremonial shield with two concept variants.",
            review_mode="automatic_vlm",
        ),
    )
    run = container.runs.queue_run(session.id, message)

    processed = container.worker.process_next_once()

    assert processed is True
    stored_run = container.store.get_run(run.id)
    assert stored_run.status == "completed"
    artifacts = container.store.list_artifacts_for_run(run.id)
    assert {artifact.kind for artifact in artifacts} >= {"raw_image", "prepared_image", "object3d", "catalog"}
    assert Path(next(artifact.path for artifact in artifacts if artifact.kind == "catalog")).exists()


def test_review_mode_endpoint_resumes_waiting_run(tmp_path: Path):
    container = _build_test_container(tmp_path)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Resume"}).json()
    response = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Generate one 3d shield.", "role": "user"},
    )
    run_id = response.json()["run"]["id"]
    assert response.json()["run"]["status"] == "awaiting_review_mode"

    resume = client.post(f"/runs/{run_id}/review-mode", json={"review_mode": "hybrid"})
    assert resume.status_code == 200
    assert resume.json()["status"] == "queued"

    container.worker.process_next_once()
    run = client.get(f"/runs/{run_id}").json()
    assert run["status"] == "completed"


def test_queue_run_uses_fast_fallback_and_defers_llm_planning(tmp_path: Path):
    container = _build_test_container(tmp_path)
    planner_adapter = container.planner.text_adapter
    session = container.sessions.create_session(SessionCreate(title="Fast queue"))
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(role="user", content="Generate a 3d shield.", review_mode="manual"),
    )

    run = container.runs.queue_run(session.id, message)

    assert run.status == "queued"
    assert planner_adapter.calls == 0

    container.worker.process_next_once()
    assert planner_adapter.calls == 0


def test_command_mode_text_to_image_forces_generation_for_unknown_subject_words(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Command mode generation"))
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(
            role="user",
            content="generate a yeniçeri with white background",
            metadata={"command_mode": "text_to_image"},
        ),
    )

    run = container.runs.queue_run(session.id, message)

    assert run.status == "queued"
    assert run.plan.intent_type == "single_object_image"
    assert run.plan.requested_outputs == ["image"]

    container.worker.process_next_once()
    artifacts = container.store.list_artifacts_for_run(run.id)
    assert any(artifact.kind == "raw_image" for artifact in artifacts)


def test_set_review_mode_uses_fast_fallback_and_defers_llm_planning(tmp_path: Path):
    container = _build_test_container(tmp_path)
    planner_adapter = container.planner.text_adapter
    session = container.sessions.create_session(SessionCreate(title="Fast review mode"))
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(role="user", content="Generate a 3d shield."),
    )

    run = container.runs.queue_run(session.id, message)
    assert run.status == "awaiting_review_mode"
    assert planner_adapter.calls == 0

    run = container.runs.set_review_mode(run.id, "manual")

    assert run.status == "queued"
    assert planner_adapter.calls == 0

    container.worker.process_next_once()
    assert planner_adapter.calls == 0


def test_chat_only_prompt_completes_without_review_or_artifacts(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Chat only"))
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(role="user", content="hey"),
    )

    run = container.runs.queue_run(session.id, message)

    assert run.status == "queued"
    assert run.plan.intent_type == "chat_only"
    assert run.plan.needs_user_choice is False

    processed = container.worker.process_next_once()

    assert processed is True
    stored_run = container.store.get_run(run.id)
    assert stored_run.status == "completed"
    assert container.store.list_artifacts_for_run(run.id) == []
    messages = container.store.list_messages(session.id)
    assert messages[-1].role == "assistant"
    assert messages[-1].content == "Chat reply: hey"
    events = container.store.list_events(session.id)
    event_types = [event.type for event in events]
    assert "message.thinking" in event_types
    assert "message.stream.started" in event_types
    assert "message.stream.delta" in event_types


def test_generation_run_emits_stage_progress_events(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Progress"))
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(
            role="user",
            content="Generate a 3d ceremonial shield with two concept variants.",
            review_mode="automatic_vlm",
        ),
    )
    run = container.runs.queue_run(session.id, message)

    container.worker.process_next_once()

    progress_events = [event for event in container.store.list_events(session.id) if event.type == "stage.progress"]
    assert progress_events
    assert any(event.payload.get("stage") == "generate_images" for event in progress_events)


def test_single_object_3d_with_selected_image_reuses_source_without_image_generation(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Reuse source image"))
    import_run = Run(
        session_id=session.id,
        status="completed",
        intent_type="chat_only",
        grouping_strategy="imports",
        plan=container.planner._chat_only_plan("import"),
    )
    container.store.add_run(import_run)
    source_path = container.artifact_store.build_path(import_run.id, "upload", "source.png")
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (64, 64), (0, 0, 0, 0)).save(source_path)
    from forgeflow_api.domain.models import Artifact

    source_artifact = Artifact(
        run_id=import_run.id,
        session_id=session.id,
        stage="upload",
        kind="raw_image",
        status="uploaded",
        title="Door",
        group_key="imports",
        path=str(source_path),
        mime_type="image/png",
        metadata={"uploaded": True},
    )
    container.store.add_artifact(source_artifact)

    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(
            role="user",
            content="Bu görselden 3D asset üret.",
            review_mode="automatic_vlm",
            metadata={
                "selected_asset_id": source_artifact.id,
                "selected_asset_kind": "raw_image",
                "selected_asset_title": "Door",
                "selected_asset_group_key": "imports",
            },
        ),
    )
    run = container.runs.queue_run(session.id, message)

    container.worker.process_next_once()

    assert container.test_image_adapter.calls == []
    stored_run = container.store.get_run(run.id)
    assert stored_run.status == "completed"
    raw_images = [artifact for artifact in container.store.list_artifacts_for_run(run.id) if artifact.kind == "raw_image"]
    assert raw_images
    assert raw_images[0].status == "reused"
    assert raw_images[0].metadata["reused_source_artifact_id"] == source_artifact.id


def test_selected_image_edit_request_uses_source_image_paths(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Edit flow"))

    seed_message = container.sessions.add_user_message(
        session.id,
        MessageCreate(role="user", content="Generate a shield image.", review_mode="automatic_vlm"),
    )
    seed_run = container.runs.queue_run(session.id, seed_message)
    container.worker.process_next_once()
    source_artifact = next(
        artifact for artifact in container.store.list_artifacts_for_run(seed_run.id) if artifact.kind == "raw_image"
    )

    edit_message = container.sessions.add_user_message(
        session.id,
        MessageCreate(
            role="user",
            content="Edit this image to add scratches and a darker bronze finish.",
            review_mode="automatic_vlm",
            metadata={
                "selected_asset_id": source_artifact.id,
                "selected_asset_kind": source_artifact.kind,
                "selected_asset_title": source_artifact.title,
                "selected_asset_group_key": source_artifact.group_key,
            },
        ),
    )
    edit_run = container.runs.queue_run(session.id, edit_message, session_messages=container.store.list_messages(session.id))

    container.worker.process_next_once()

    latest_call = container.test_image_adapter.calls[-1]
    assert latest_call["kwargs"]["source_image_paths"] == [source_artifact.path]
    edited_artifact = next(
        artifact for artifact in container.store.list_artifacts_for_run(edit_run.id) if artifact.kind == "raw_image"
    )
    assert edited_artifact.metadata["edit_source_artifact_id"] == source_artifact.id


def test_catalog_model_selection_resolves_matching_provider_for_image_edit(tmp_path: Path):
    container = _build_test_container(tmp_path)
    session = container.sessions.create_session(SessionCreate(title="Catalog Edit"))
    image_provider = next(provider for provider in container.provider_registry.list_models() if "image_editing" in provider.capabilities)
    message = container.sessions.add_user_message(
        session.id,
        MessageCreate(
            role="user",
            content="make the blue areas red",
            metadata={
                "command_mode": "image_edit",
                "selected_model_ref": image_provider.normalized_id.upper(),
                "selected_model_source": image_provider.source_kind,
                "selected_model_capability": "image_editing",
                "selected_asset_id": "asset_source",
                "selected_asset_kind": "raw_image",
            },
        ),
    )

    run = container.runs.queue_run(session.id, message)

    assert run.plan.context["preferred_providers"]["image_editing"] == image_provider.id


def test_follow_up_review_reply_resumes_existing_run_instead_of_creating_new_one(tmp_path: Path):
    container = _build_test_container(tmp_path)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Conversation"}).json()
    first = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Create a ceremonial shield object.", "role": "user"},
    ).json()

    first_run_id = first["run"]["id"]
    assert first["run"]["status"] == "awaiting_review_mode"

    second = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "go", "role": "user"},
    ).json()

    assert second["run"]["id"] == first_run_id
    assert second["run"]["status"] == "queued"

    container.worker.process_next_once()

    bundle = client.get(f"/chat/sessions/{session['id']}").json()
    assert len(bundle["runs"]) == 1
    assert bundle["runs"][0]["status"] == "completed"
    assert any(message["metadata"].get("type") == "review_mode_request" for message in bundle["messages"])
    assert any(message["metadata"].get("type") == "review_mode_selected" for message in bundle["messages"])


def test_explicit_automatic_vlm_reply_resumes_existing_run(tmp_path: Path):
    container = _build_test_container(tmp_path)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Automatic VLM"}).json()
    first = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Generate a shield image.", "role": "user"},
    ).json()

    first_run_id = first["run"]["id"]
    assert first["run"]["status"] == "awaiting_review_mode"

    second = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "automatic_vlm", "role": "user"},
    ).json()

    assert second["run"]["id"] == first_run_id
    assert second["run"]["status"] == "queued"


def test_pending_review_allows_normal_chat_without_forcing_review_selection(tmp_path: Path):
    container = _build_test_container(tmp_path)
    client = TestClient(create_app(container=container))

    session = client.post("/chat/sessions", json={"title": "Pending review chat"}).json()
    first = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Generate a shield image.", "role": "user"},
    ).json()

    assert first["run"]["status"] == "awaiting_review_mode"

    second = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "adın ne", "role": "user"},
    ).json()

    assert second["run"]["id"] != first["run"]["id"]
    assert second["run"]["intent_type"] == "chat_only"

    container.worker.process_next_once()

    bundle = client.get(f"/chat/sessions/{session['id']}").json()
    assert any(message["content"] == "Chat reply: adın ne" for message in bundle["messages"])
    pending = next(run for run in bundle["runs"] if run["id"] == first["run"]["id"])
    assert pending["status"] == "awaiting_review_mode"


def test_model_switch_message_updates_session_preferences_and_next_run_uses_selected_image_provider(tmp_path: Path):
    container = _build_test_container(tmp_path)
    extra_provider = container.provider_registry.register_huggingface_model("/models/flux-9b")
    extra_provider.label = "Local FLUX 9B"
    extra_provider.capabilities = ["image_generation"]
    container.store.upsert_provider(extra_provider)
    extra_adapter = DummyImageAdapter()
    container.adapter_manager.register(extra_provider.id, extra_adapter)
    container.adapter_manager.register(f"{extra_provider.id}:image_generation", extra_adapter)

    client = TestClient(create_app(container=container))
    session = client.post("/chat/sessions", json={"title": "Model switch"}).json()

    switch_response = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "bundan sonra image model olarak flux 9b kullan", "role": "user"},
    ).json()

    assert switch_response["run"]["intent_type"] == "chat_only"

    container.worker.process_next_once()

    stored_session = container.store.get_session(session["id"])
    assert stored_session.metadata["preferred_providers"]["image_generation"] == extra_provider.id

    generate_response = client.post(
        f"/chat/sessions/{session['id']}/messages",
        json={"content": "Generate a bronze shield image only.", "role": "user", "review_mode": "manual"},
    ).json()

    container.worker.process_next_once()

    run_artifacts = container.store.list_artifacts_for_run(generate_response["run"]["id"])
    raw_image = next(artifact for artifact in run_artifacts if artifact.kind == "raw_image")
    assert raw_image.metadata["provider_id"] == extra_provider.id
    assert extra_adapter.calls


def test_build_container_recovers_incomplete_runs_before_worker_start(tmp_path: Path):
    seed = _build_test_container(tmp_path)
    session = seed.sessions.create_session(SessionCreate(title="Recovery"))
    message = seed.sessions.add_user_message(
        session.id,
        MessageCreate(role="user", content="Generate a shield image."),
    )
    run = seed.runs.queue_run(session.id, message)
    run.status = "running"
    seed.store.update_run(run)

    recovered = build_container(
        data_root=tmp_path,
        start_worker=False,
        register_defaults=False,
    )

    stored_run = recovered.store.get_run(run.id)
    assert stored_run.status == "failed"
    assert stored_run.error_message == "recovered_after_restart"


def test_build_container_registers_split_runtime_paths(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("FORGEFLOW_FLUX_RUNTIME_PYTHON", "/runtime/flux-python")
    monkeypatch.setenv("FORGEFLOW_HUNYUAN_RUNTIME_PYTHON", "/runtime/hunyuan-python")
    monkeypatch.setenv("FORGEFLOW_DEFAULT_PROVIDER_STACK", "local")

    container = build_container(
        data_root=tmp_path,
        start_worker=False,
        register_defaults=True,
    )

    image_provider = next(provider for provider in container.provider_registry.list_models() if "image_generation" in provider.capabilities)
    object_provider = next(provider for provider in container.provider_registry.list_models() if "object3d_generation" in provider.capabilities)

    image_adapter = container.adapter_manager.get(image_provider, "image_generation")
    object_adapter = container.adapter_manager.get(object_provider, "object3d_generation")

    assert image_adapter.python_bin == "/runtime/flux-python"
    assert object_adapter.python_bin == "/runtime/hunyuan-python"


def test_build_container_uses_split_local_flux_models_for_generation_and_editing(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("FORGEFLOW_DEFAULT_PROVIDER_STACK", "local")
    monkeypatch.setenv("FORGEFLOW_FLUX_MODEL_PATH", "black-forest-labs/flux.2-klein-4b")
    monkeypatch.setenv("FORGEFLOW_FLUX_EDIT_MODEL_PATH", "/home/oguzhan/Desktop/models/FLUX.2-klein-9B/")

    container = build_container(
        data_root=tmp_path,
        start_worker=False,
        register_defaults=True,
    )

    generation_provider = next(
        provider for provider in container.provider_registry.list_models() if "image_generation" in provider.capabilities
    )
    edit_provider = next(
        provider
        for provider in container.provider_registry.list_models()
        if provider.normalized_id == "/home/oguzhan/Desktop/models/FLUX.2-klein-9B"
    )

    assert generation_provider.normalized_id == "black-forest-labs/flux.2-klein-4b"
    assert "image_editing" in generation_provider.capabilities
    assert edit_provider.normalized_id == "/home/oguzhan/Desktop/models/FLUX.2-klein-9B"
