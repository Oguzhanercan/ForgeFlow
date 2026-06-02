from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from forgeflow_api.adapters.hf_image import HuggingFaceDiffusersImageAdapter
from forgeflow_api.adapters.hf_text import HuggingFaceTextAdapter
from forgeflow_api.adapters.hf_vision import HuggingFaceVisionReviewAdapter
from forgeflow_api.adapters.hunyuan3d import Hunyuan3DAdapter
from forgeflow_api.adapters.nvidia import NVIDIAImageAdapter, NVIDIAKimiAdapter, NVIDIATrellisAdapter, resolve_nvidia_api_key
from forgeflow_api.adapters.openrouter import OpenRouterTextAdapter
from forgeflow_api.core.adapter_manager import AdapterManager
from forgeflow_api.core.artifacts import ArtifactStore
from forgeflow_api.core.pipeline_engine import PipelineEngine
from forgeflow_api.core.services import ConversationService, RunService, SessionService
from forgeflow_api.core.store import SQLiteStore
from forgeflow_api.core.worker import RunWorker
from forgeflow_api.domain.planner import RequestPlanner
from forgeflow_api.domain.providers import ProviderRegistry
from forgeflow_api.domain.review import ReviewPolicyEngine


DEFAULT_VLM_MODEL = os.getenv("FORGEFLOW_LOCAL_VLM_MODEL", "google/gemma-4-E4B-it")
DEFAULT_OPENROUTER_MODEL = os.getenv("FORGEFLOW_OPENROUTER_MODEL", "minimax/minimax-m2.5:free")
DEFAULT_FLUX_GENERATION_PATH = os.getenv("FORGEFLOW_FLUX_MODEL_PATH", "black-forest-labs/flux.2-klein-4b")
DEFAULT_FLUX_EDIT_PATH = os.getenv("FORGEFLOW_FLUX_EDIT_MODEL_PATH", "/home/oguzhan/Desktop/models/FLUX.2-klein-9B/")
DEFAULT_HUNYUAN_ROOT = os.getenv("FORGEFLOW_HUNYUAN_ROOT", "/home/oguzhan/Desktop/hunyuan3d-2.1")
DEFAULT_NVIDIA_KIMI_MODEL = os.getenv("FORGEFLOW_NVIDIA_KIMI_MODEL", "moonshotai/kimi-k2.5")
DEFAULT_NVIDIA_IMAGE_MODEL = os.getenv("FORGEFLOW_NVIDIA_IMAGE_MODEL", "black-forest-labs/flux.2-klein-4b")
DEFAULT_NVIDIA_3D_MODEL = os.getenv("FORGEFLOW_NVIDIA_3D_MODEL", "microsoft/trellis")


def _prune_stale_local_providers(registry: ProviderRegistry) -> None:
    """Deactivate providers whose local model path no longer exists."""
    if registry.store is None:
        return
    for provider in registry.store.list_providers():
        path = Path(provider.normalized_id)
        if path.is_absolute() and not path.exists():
            provider.status = "inactive"
            provider.capabilities = []
            registry.store.upsert_provider(provider)


def resolve_default_provider_stack() -> str:
    return os.getenv("FORGEFLOW_DEFAULT_PROVIDER_STACK", "nvidia")


def resolve_flux_runtime_python() -> str:
    return os.getenv(
        "FORGEFLOW_FLUX_RUNTIME_PYTHON",
        os.getenv(
            "FORGEFLOW_LOCAL_RUNTIME_PYTHON",
            "/home/oguzhan/Desktop/hunyuan3d-2.1/pipelines/flux_hunyuan_batch/.venv_flux/bin/python",
        ),
    )


def resolve_hunyuan_runtime_python() -> str:
    return os.getenv(
        "FORGEFLOW_HUNYUAN_RUNTIME_PYTHON",
        os.getenv(
            "FORGEFLOW_LOCAL_RUNTIME_PYTHON",
            "/home/oguzhan/Desktop/hunyuan3d-2.1/.venv/bin/python",
        ),
    )


@dataclass
class ServiceContainer:
    store: SQLiteStore
    artifact_store: ArtifactStore
    adapter_manager: AdapterManager
    pipeline_engine: PipelineEngine
    planner: RequestPlanner
    provider_registry: ProviderRegistry
    review_engine: ReviewPolicyEngine
    sessions: SessionService
    runs: RunService
    conversations: ConversationService
    worker: RunWorker


def build_container(
    *,
    data_root: str | Path | None = None,
    start_worker: bool = True,
    register_defaults: bool = True,
) -> ServiceContainer:
    root = Path(data_root or "services/api/data")
    store = SQLiteStore(root / "forgeflow.db")
    store.recover_incomplete_runs()
    artifact_store = ArtifactStore(root / "artifacts")
    adapter_manager = AdapterManager()
    provider_registry = ProviderRegistry(store=store)
    review_engine = ReviewPolicyEngine()

    _prune_stale_local_providers(provider_registry)

    if register_defaults:
        _register_default_providers(provider_registry, adapter_manager)

    planner_provider = _select_planner_adapter(provider_registry, adapter_manager)
    planner = RequestPlanner(text_adapter=planner_provider)
    pipeline_engine = PipelineEngine(artifact_store, store, provider_registry, adapter_manager, review_engine)
    sessions = SessionService(store)
    runs = RunService(store, planner, review_engine)
    conversations = ConversationService(store, sessions, runs, planner)
    worker = RunWorker(store, pipeline_engine, planner)

    container = ServiceContainer(
        store=store,
        artifact_store=artifact_store,
        adapter_manager=adapter_manager,
        pipeline_engine=pipeline_engine,
        planner=planner,
        provider_registry=provider_registry,
        review_engine=review_engine,
        sessions=sessions,
        runs=runs,
        conversations=conversations,
        worker=worker,
    )
    if start_worker:
        worker.start()
    return container


def _register_default_providers(provider_registry: ProviderRegistry, adapter_manager: AdapterManager) -> None:
    use_nvidia_stack = resolve_default_provider_stack() == "nvidia" and bool(resolve_nvidia_api_key())
    if use_nvidia_stack:
        _register_nvidia_defaults(provider_registry, adapter_manager)
        return

    planner_provider = provider_registry.register_huggingface_model(DEFAULT_VLM_MODEL)
    planner_provider.capabilities = ["planner_text", "text_chat", "vision_review"]
    provider_registry.store.upsert_provider(planner_provider)
    adapter_manager.register_factory(
        planner_provider.id,
        lambda model_ref=planner_provider.normalized_id: HuggingFaceTextAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{planner_provider.id}:vision_review",
        lambda model_ref=planner_provider.normalized_id: HuggingFaceVisionReviewAdapter(model_ref),
    )

    openrouter_provider = provider_registry.register_openrouter(DEFAULT_OPENROUTER_MODEL)
    adapter_manager.register_factory(
        openrouter_provider.id,
        lambda model_ref=openrouter_provider.normalized_id: OpenRouterTextAdapter(model_ref),
    )

    image_provider = provider_registry.register_huggingface_model(DEFAULT_FLUX_GENERATION_PATH)
    image_provider.capabilities = ["image_generation", "image_editing"]
    provider_registry.store.upsert_provider(image_provider)
    adapter_manager.register_factory(
        image_provider.id,
        lambda model_ref=image_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
            model_ref,
            python_bin=resolve_flux_runtime_python(),
        ),
    )
    adapter_manager.register_factory(
        f"{image_provider.id}:image_generation",
        lambda model_ref=image_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
            model_ref,
            python_bin=resolve_flux_runtime_python(),
        ),
    )
    adapter_manager.register_factory(
        f"{image_provider.id}:image_editing",
        lambda model_ref=image_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
            model_ref,
            python_bin=resolve_flux_runtime_python(),
        ),
    )

    if os.getenv("FORGEFLOW_FLUX_EDIT_MODEL_PATH") or Path(DEFAULT_FLUX_EDIT_PATH).exists():
        edit_provider = provider_registry.register_huggingface_model(DEFAULT_FLUX_EDIT_PATH)
        edit_provider.capabilities = ["image_editing"]
        provider_registry.store.upsert_provider(edit_provider)
        adapter_manager.register_factory(
            edit_provider.id,
            lambda model_ref=edit_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                model_ref,
                python_bin=resolve_flux_runtime_python(),
            ),
        )
        adapter_manager.register_factory(
            f"{edit_provider.id}:image_editing",
            lambda model_ref=edit_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                model_ref,
                python_bin=resolve_flux_runtime_python(),
            ),
        )

    object_provider = provider_registry.register_huggingface_model(DEFAULT_HUNYUAN_ROOT)
    object_provider.capabilities = ["object3d_generation"]
    object_provider.source_kind = "local_custom"
    provider_registry.store.upsert_provider(object_provider)
    adapter_manager.register_factory(
        object_provider.id,
        lambda root_dir=object_provider.normalized_id: Hunyuan3DAdapter(
            root_dir,
            python_bin=resolve_hunyuan_runtime_python(),
        ),
    )


def _register_nvidia_defaults(provider_registry: ProviderRegistry, adapter_manager: AdapterManager) -> None:
    planner_provider = provider_registry.register_nvidia_build(
        DEFAULT_NVIDIA_KIMI_MODEL,
        capabilities=["planner_text", "text_chat", "vision_review"],
    )
    adapter_manager.register_factory(
        planner_provider.id,
        lambda model_ref=planner_provider.normalized_id: NVIDIAKimiAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{planner_provider.id}:planner_text",
        lambda model_ref=planner_provider.normalized_id: NVIDIAKimiAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{planner_provider.id}:text_chat",
        lambda model_ref=planner_provider.normalized_id: NVIDIAKimiAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{planner_provider.id}:vision_review",
        lambda model_ref=planner_provider.normalized_id: NVIDIAKimiAdapter(model_ref),
    )

    image_provider = provider_registry.register_nvidia_build(
        DEFAULT_NVIDIA_IMAGE_MODEL,
        capabilities=["image_generation", "image_editing"],
    )
    adapter_manager.register_factory(
        image_provider.id,
        lambda model_ref=image_provider.normalized_id: NVIDIAImageAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{image_provider.id}:image_generation",
        lambda model_ref=image_provider.normalized_id: NVIDIAImageAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{image_provider.id}:image_editing",
        lambda model_ref=image_provider.normalized_id: NVIDIAImageAdapter(model_ref),
    )

    # Local FLUX model for image editing (subprocess, freed after use)
    local_flux_provider = provider_registry.register_huggingface_model(DEFAULT_FLUX_GENERATION_PATH)
    local_flux_provider.capabilities = ["image_editing"]
    provider_registry.store.upsert_provider(local_flux_provider)
    adapter_manager.register_factory(
        local_flux_provider.id,
        lambda model_ref=local_flux_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
            model_ref,
            python_bin=resolve_flux_runtime_python(),
        ),
    )
    adapter_manager.register_factory(
        f"{local_flux_provider.id}:image_editing",
        lambda model_ref=local_flux_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
            model_ref,
            python_bin=resolve_flux_runtime_python(),
        ),
    )

    if os.getenv("FORGEFLOW_FLUX_EDIT_MODEL_PATH") or Path(DEFAULT_FLUX_EDIT_PATH).exists():
        edit_provider = provider_registry.register_huggingface_model(DEFAULT_FLUX_EDIT_PATH)
        edit_provider.capabilities = ["image_editing"]
        provider_registry.store.upsert_provider(edit_provider)
        adapter_manager.register_factory(
            edit_provider.id,
            lambda model_ref=edit_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                model_ref,
                python_bin=resolve_flux_runtime_python(),
            ),
        )
        adapter_manager.register_factory(
            f"{edit_provider.id}:image_editing",
            lambda model_ref=edit_provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                model_ref,
                python_bin=resolve_flux_runtime_python(),
            ),
        )

    object_provider = provider_registry.register_huggingface_model(DEFAULT_HUNYUAN_ROOT)
    object_provider.capabilities = ["object3d_generation"]
    object_provider.source_kind = "local_custom"
    provider_registry.store.upsert_provider(object_provider)
    adapter_manager.register_factory(
        object_provider.id,
        lambda root_dir=object_provider.normalized_id: Hunyuan3DAdapter(
            root_dir,
            python_bin=resolve_hunyuan_runtime_python(),
        ),
    )
    adapter_manager.register_factory(
        f"{object_provider.id}:object3d_generation",
        lambda root_dir=object_provider.normalized_id: Hunyuan3DAdapter(
            root_dir,
            python_bin=resolve_hunyuan_runtime_python(),
        ),
    )

    trellis_provider = provider_registry.register_nvidia_build(
        DEFAULT_NVIDIA_3D_MODEL,
        capabilities=["object3d_generation"],
    )
    adapter_manager.register_factory(
        trellis_provider.id,
        lambda model_ref=trellis_provider.normalized_id: NVIDIATrellisAdapter(model_ref),
    )
    adapter_manager.register_factory(
        f"{trellis_provider.id}:object3d_generation",
        lambda model_ref=trellis_provider.normalized_id: NVIDIATrellisAdapter(model_ref),
    )


def _select_planner_adapter(provider_registry: ProviderRegistry, adapter_manager: AdapterManager):
    planner_candidates = [
        provider
        for provider in provider_registry.find_by_capability("planner_text")
        if adapter_manager.has(provider, "planner_text")
    ]
    if not planner_candidates:
        return None
    local_candidates = [provider for provider in planner_candidates if provider.source_kind == "local_hf_transformers"]
    provider = local_candidates[0] if local_candidates else planner_candidates[0]
    return adapter_manager.get(provider, "planner_text")
