from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from forgeflow_api.adapters.hf_image import HuggingFaceDiffusersImageAdapter
from forgeflow_api.adapters.hf_text import HuggingFaceTextAdapter
from forgeflow_api.adapters.hf_vision import HuggingFaceVisionReviewAdapter
from forgeflow_api.adapters.hunyuan3d import Hunyuan3DAdapter
from forgeflow_api.adapters.nvidia import NVIDIAImageAdapter, NVIDIAKimiAdapter, NVIDIATrellisAdapter
from forgeflow_api.adapters.openrouter import OpenRouterTextAdapter
from forgeflow_api.core.dependencies import resolve_flux_runtime_python, resolve_hunyuan_runtime_python
from forgeflow_api.domain.models import ProviderModel


class ModelRegistrationRequest(BaseModel):
    model_ref: str
    provider_kind: str = "huggingface"


class ProviderTestRequest(BaseModel):
    provider_id: str
    capability: str | None = None


class ProviderStatusRequest(BaseModel):
    status: str


router = APIRouter(prefix="/providers", tags=["providers"])


def _register_provider_adapters(request: Request, provider: ProviderModel) -> None:
    manager = request.app.state.container.adapter_manager
    registration_kind = provider.metadata.get("registration_kind")

    if registration_kind == "openrouter":
        manager.register_factory(provider.id, lambda model_ref=provider.normalized_id: OpenRouterTextAdapter(model_ref))
        manager.register_factory(
            f"{provider.id}:planner_text",
            lambda model_ref=provider.normalized_id: OpenRouterTextAdapter(model_ref),
        )
        manager.register_factory(
            f"{provider.id}:text_chat",
            lambda model_ref=provider.normalized_id: OpenRouterTextAdapter(model_ref),
        )
        return

    if registration_kind == "nvidia_build":
        if any(cap in provider.capabilities for cap in {"planner_text", "text_chat", "vision_review"}):
            manager.register_factory(provider.id, lambda model_ref=provider.normalized_id: NVIDIAKimiAdapter(model_ref))
            if "planner_text" in provider.capabilities:
                manager.register_factory(
                    f"{provider.id}:planner_text",
                    lambda model_ref=provider.normalized_id: NVIDIAKimiAdapter(model_ref),
                )
            if "text_chat" in provider.capabilities:
                manager.register_factory(
                    f"{provider.id}:text_chat",
                    lambda model_ref=provider.normalized_id: NVIDIAKimiAdapter(model_ref),
                )
            if "vision_review" in provider.capabilities:
                manager.register_factory(
                    f"{provider.id}:vision_review",
                    lambda model_ref=provider.normalized_id: NVIDIAKimiAdapter(model_ref),
                )
        if any(cap in provider.capabilities for cap in {"image_generation", "image_editing"}):
            manager.register_factory(provider.id, lambda model_ref=provider.normalized_id: NVIDIAImageAdapter(model_ref))
            if "image_generation" in provider.capabilities:
                manager.register_factory(
                    f"{provider.id}:image_generation",
                    lambda model_ref=provider.normalized_id: NVIDIAImageAdapter(model_ref),
                )
            if "image_editing" in provider.capabilities:
                manager.register_factory(
                    f"{provider.id}:image_editing",
                    lambda model_ref=provider.normalized_id: NVIDIAImageAdapter(model_ref),
                )
        if "object3d_generation" in provider.capabilities:
            manager.register_factory(provider.id, lambda model_ref=provider.normalized_id: NVIDIATrellisAdapter(model_ref))
            manager.register_factory(
                f"{provider.id}:object3d_generation",
                lambda model_ref=provider.normalized_id: NVIDIATrellisAdapter(model_ref),
            )
        return

    if provider.source_kind == "local_hf_transformers":
        manager.register_factory(provider.id, lambda model_ref=provider.normalized_id: HuggingFaceTextAdapter(model_ref))
        if "planner_text" in provider.capabilities:
            manager.register_factory(
                f"{provider.id}:planner_text",
                lambda model_ref=provider.normalized_id: HuggingFaceTextAdapter(model_ref),
            )
        if "text_chat" in provider.capabilities:
            manager.register_factory(
                f"{provider.id}:text_chat",
                lambda model_ref=provider.normalized_id: HuggingFaceTextAdapter(model_ref),
            )
        if "vision_review" in provider.capabilities:
            manager.register_factory(
                f"{provider.id}:vision_review",
                lambda model_ref=provider.normalized_id: HuggingFaceVisionReviewAdapter(model_ref),
            )
        return

    if provider.source_kind == "local_hf_diffusers" and any(cap in provider.capabilities for cap in {"image_generation", "image_editing"}):
        manager.register_factory(
            provider.id,
            lambda model_ref=provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                model_ref,
                python_bin=resolve_flux_runtime_python(),
            ),
        )
        if "image_generation" in provider.capabilities:
            manager.register_factory(
                f"{provider.id}:image_generation",
                lambda model_ref=provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                    model_ref,
                    python_bin=resolve_flux_runtime_python(),
                ),
            )
        if "image_editing" in provider.capabilities:
            manager.register_factory(
                f"{provider.id}:image_editing",
                lambda model_ref=provider.normalized_id: HuggingFaceDiffusersImageAdapter(
                    model_ref,
                    python_bin=resolve_flux_runtime_python(),
                ),
            )
        return

    if provider.source_kind == "local_custom" and "object3d_generation" in provider.capabilities:
        manager.register_factory(
            provider.id,
            lambda root_dir=provider.normalized_id: Hunyuan3DAdapter(
                root_dir,
                python_bin=resolve_hunyuan_runtime_python(),
            ),
        )
        manager.register_factory(
            f"{provider.id}:object3d_generation",
            lambda root_dir=provider.normalized_id: Hunyuan3DAdapter(
                root_dir,
                python_bin=resolve_hunyuan_runtime_python(),
            ),
        )


@router.post("/register")
def register_provider(payload: ModelRegistrationRequest, request: Request):
    if payload.provider_kind == "openrouter":
        provider = request.app.state.container.provider_registry.register_openrouter(payload.model_ref)
        _register_provider_adapters(request, provider)
        return provider
    if payload.provider_kind == "nvidia":
        provider = request.app.state.container.provider_registry.register_nvidia_build(
            payload.model_ref,
        )
        _register_provider_adapters(request, provider)
        return provider
    provider = request.app.state.container.provider_registry.register_huggingface_model(payload.model_ref)
    _register_provider_adapters(request, provider)
    return provider


@router.get("/models")
def list_models(request: Request):
    return request.app.state.container.provider_registry.list_models()


@router.get("/catalog")
def list_catalog(request: Request):
    return request.app.state.container.provider_registry.list_catalog()


@router.post("/test")
def test_provider(payload: ProviderTestRequest, request: Request):
    try:
        provider = request.app.state.container.provider_registry.get_provider(payload.provider_id)
        adapter = request.app.state.container.adapter_manager.get(provider, payload.capability)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="provider not found") from exc
    health = adapter.healthcheck()
    return {"provider_id": provider.id, "ok": health.ok, "detail": health.detail}


@router.post("/{provider_id}/status")
def update_provider_status(provider_id: str, payload: ProviderStatusRequest, request: Request):
    if payload.status not in {"active", "disabled"}:
        raise HTTPException(status_code=400, detail="invalid provider status")
    try:
        provider = request.app.state.container.provider_registry.get_provider(provider_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="provider not found") from exc
    provider.status = payload.status
    request.app.state.container.store.upsert_provider(provider)
    return provider
