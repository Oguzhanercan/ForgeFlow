from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from huggingface_hub import HfApi

from forgeflow_api.core.store import SQLiteStore
from forgeflow_api.domain.model_catalog import default_model_catalog
from forgeflow_api.domain.models import ModelCatalogEntry
from forgeflow_api.domain.models import ProviderModel


@dataclass
class CapabilityProfile:
    source_kind: str
    capabilities: list[str]


class ProviderRegistry:
    def __init__(self, store: SQLiteStore | None = None, hf_api: HfApi | None = None) -> None:
        self.store = store
        self.hf_api = hf_api or HfApi()

    def register_huggingface_model(self, raw_id: str) -> ProviderModel:
        normalized = self._normalize_hf_id(raw_id)
        profile = self._inspect_capabilities(normalized)
        existing_id = self._find_existing_id(normalized, profile.source_kind, "huggingface")
        provider = ProviderModel(
            id=existing_id or f"provider_{uuid4().hex}",
            label=Path(normalized).name if Path(normalized).exists() else normalized.split("/")[-1],
            normalized_id=normalized,
            source_kind=profile.source_kind,
            capabilities=profile.capabilities,
            status="active" if profile.capabilities else "needs_override",
            metadata={"registration_kind": "huggingface"},
        )
        if self.store is not None:
            self.store.upsert_provider(provider)
        return provider

    def register_openrouter(self, model: str) -> ProviderModel:
        existing_id = self._find_existing_id(model, "api_openrouter", "openrouter")
        provider = ProviderModel(
            id=existing_id or f"provider_{uuid4().hex}",
            label=f"OpenRouter / {model}",
            normalized_id=model,
            source_kind="api_openrouter",
            capabilities=["planner_text", "text_chat"],
            status="active",
            metadata={"registration_kind": "openrouter"},
        )
        if self.store is not None:
            self.store.upsert_provider(provider)
        return provider

    def register_nvidia_build(self, model: str, *, capabilities: list[str] | None = None) -> ProviderModel:
        resolved_capabilities = capabilities or self._infer_nvidia_capabilities(model)
        existing_id = self._find_existing_id(model, "api_generic", "nvidia_build")
        provider = ProviderModel(
            id=existing_id or f"provider_{uuid4().hex}",
            label=f"NVIDIA / {model}",
            normalized_id=model,
            source_kind="api_generic",
            capabilities=resolved_capabilities,
            status="active" if resolved_capabilities else "needs_override",
            metadata={"registration_kind": "nvidia_build"},
        )
        if self.store is not None:
            self.store.upsert_provider(provider)
        return provider

    def list_models(self) -> list[ProviderModel]:
        if self.store is None:
            return []
        return self.store.list_providers()

    def list_catalog(self) -> list[ModelCatalogEntry]:
        return default_model_catalog()

    def get_provider(self, provider_id: str) -> ProviderModel:
        if self.store is None:
            raise KeyError(provider_id)
        return self.store.get_provider(provider_id)

    def find_by_capability(self, capability: str) -> list[ProviderModel]:
        providers = self.list_models()
        return [provider for provider in providers if capability in provider.capabilities and provider.status == "active"]

    def _normalize_hf_id(self, raw_id: str) -> str:
        value = raw_id.strip().removesuffix("/")
        marker = "huggingface.co/"
        if marker in value:
            value = value.split(marker, 1)[1]
        return value

    def _inspect_capabilities(self, normalized: str) -> CapabilityProfile:
        local_path = Path(normalized)
        if local_path.exists():
            return self._inspect_local_path(local_path)
        remote = self._inspect_remote_model(normalized)
        if remote is not None:
            return remote
        return self._infer_capabilities_from_name(normalized)

    def _inspect_local_path(self, path: Path) -> CapabilityProfile:
        lowered = str(path).lower()
        if (path / "model_index.json").exists():
            return CapabilityProfile("local_hf_diffusers", ["image_generation"])
        if (path / "hy3dshape").exists() or "hunyuan3d" in lowered:
            return CapabilityProfile("local_custom", ["object3d_generation"])
        config_path = path / "config.json"
        if config_path.exists():
            try:
                config = json.loads(config_path.read_text())
            except json.JSONDecodeError:
                config = {}
            return self._profile_from_config(config, normalized=str(path))
        return self._infer_capabilities_from_name(str(path))

    def _inspect_remote_model(self, normalized: str) -> CapabilityProfile | None:
        try:
            info = self.hf_api.model_info(normalized)
        except Exception:
            return None
        config = info.config or {}
        if getattr(info, "pipeline_tag", None):
            config = {"pipeline_tag": info.pipeline_tag, **config}
        return self._profile_from_config(config, normalized=normalized)

    def _profile_from_config(self, config: dict, normalized: str) -> CapabilityProfile:
        pipeline_tag = str(config.get("pipeline_tag", "")).lower()
        architectures = " ".join(config.get("architectures", []) or []).lower()
        lowered = f"{normalized.lower()} {pipeline_tag} {architectures}"
        if "image" in pipeline_tag or any(token in lowered for token in ("flux", "sdxl", "stable-diffusion", "diffusionpipeline", "z-image")):
            return CapabilityProfile("local_hf_diffusers", self._infer_image_capabilities(lowered))
        if any(token in lowered for token in ("gemma-4", "llava", "internvl", "qwen-vl", "phi-vision", "vlm")):
            return CapabilityProfile("local_hf_transformers", ["planner_text", "text_chat", "vision_review"])
        if any(token in lowered for token in ("llama", "qwen", "mistral", "deepseek", "gpt-oss", "causallm")):
            return CapabilityProfile("local_hf_transformers", ["planner_text", "text_chat"])
        if any(token in lowered for token in ("hunyuan3d", "triposr", "trellis", "instantmesh")):
            return CapabilityProfile("local_custom", ["object3d_generation"])
        return self._infer_capabilities_from_name(normalized)

    def _infer_capabilities_from_name(self, normalized: str) -> CapabilityProfile:
        lowered = normalized.lower()
        if any(token in lowered for token in ("flux", "sdxl", "stable-diffusion", "imagen", "qwen-image", "z-image")):
            return CapabilityProfile("local_hf_diffusers", self._infer_image_capabilities(lowered))
        if any(token in lowered for token in ("hunyuan3d", "triposr", "trellis", "instantmesh")):
            return CapabilityProfile("local_custom", ["object3d_generation"])
        if any(token in lowered for token in ("gemma-4", "llava", "qwen-vl", "molmo", "internvl", "phi-vision")):
            return CapabilityProfile("local_hf_transformers", ["planner_text", "text_chat", "vision_review"])
        if any(token in lowered for token in ("llama", "qwen", "mistral", "deepseek", "gpt-oss")):
            return CapabilityProfile("local_hf_transformers", ["text_chat", "planner_text"])
        return CapabilityProfile("local_hf_transformers", [])

    def _infer_image_capabilities(self, lowered: str) -> list[str]:
        if any(token in lowered for token in ("edit", "kontext", "flux.2", "qwen-image-2", "z-image")):
            return ["image_generation", "image_editing"]
        return ["image_generation"]

    def _infer_nvidia_capabilities(self, model: str) -> list[str]:
        lowered = model.lower()
        if any(token in lowered for token in ("glm", "kimi", "llama", "qwen", "mistral", "deepseek", "gpt")):
            return ["planner_text", "text_chat", "vision_review"]
        if any(token in lowered for token in ("flux", "sdxl", "stable-diffusion", "imagen")):
            return ["image_generation", "image_editing"]
        if any(token in lowered for token in ("trellis", "hunyuan3d", "triposr", "instantmesh")):
            return ["object3d_generation"]
        return []

    def _find_existing_id(self, normalized_id: str, source_kind: str, registration_kind: str) -> str | None:
        if self.store is None:
            return None
        for provider in self.store.list_providers():
            if (
                provider.normalized_id == normalized_id
                and provider.source_kind == source_kind
                and provider.metadata.get("registration_kind") == registration_kind
            ):
                return provider.id
        return None
