from forgeflow_api.domain.providers import ProviderRegistry


def test_registry_normalizes_huggingface_url_and_infers_image_generation():
    registry = ProviderRegistry()

    provider = registry.register_huggingface_model(
        "https://huggingface.co/black-forest-labs/FLUX.2-klein-9B"
    )

    assert provider.normalized_id == "black-forest-labs/FLUX.2-klein-9B"
    assert "image_generation" in provider.capabilities
    assert provider.source_kind == "local_hf_diffusers"


def test_registry_flags_unknown_models_for_override():
    registry = ProviderRegistry()

    provider = registry.register_huggingface_model("someone/custom-checkpoint")

    assert provider.status == "needs_override"
    assert provider.capabilities == []


def test_registry_registers_nvidia_build_defaults():
    registry = ProviderRegistry()

    provider = registry.register_nvidia_build("moonshotai/kimi-k2.5", capabilities=["planner_text", "text_chat", "vision_review"])

    assert provider.normalized_id == "moonshotai/kimi-k2.5"
    assert provider.source_kind == "api_generic"
    assert "vision_review" in provider.capabilities
    assert provider.metadata["registration_kind"] == "nvidia_build"


def test_registry_infers_nvidia_build_capabilities_from_glm_model_name():
    registry = ProviderRegistry()

    provider = registry.register_nvidia_build("z-ai/glm-5.1")

    assert provider.normalized_id == "z-ai/glm-5.1"
    assert provider.source_kind == "api_generic"
    assert provider.capabilities == ["planner_text", "text_chat", "vision_review"]
    assert provider.status == "active"


def test_registry_infers_nvidia_build_capabilities_from_model_name():
    registry = ProviderRegistry()

    provider = registry.register_nvidia_build("black-forest-labs/flux.2-klein-4b")

    assert provider.normalized_id == "black-forest-labs/flux.2-klein-4b"
    assert provider.source_kind == "api_generic"
    assert provider.capabilities == ["image_generation", "image_editing"]
    assert provider.status == "active"


def test_registry_inspects_local_diffusers_path(tmp_path):
    registry = ProviderRegistry()
    local_model = tmp_path / "flux-local"
    local_model.mkdir()
    (local_model / "model_index.json").write_text("{}")

    provider = registry.register_huggingface_model(str(local_model))

    assert provider.normalized_id == str(local_model)
    assert provider.source_kind == "local_hf_diffusers"
    assert "image_generation" in provider.capabilities


def test_model_catalog_contains_2026_local_and_api_capability_presets():
    registry = ProviderRegistry()

    catalog = registry.list_catalog()
    by_ref = {entry.normalized_id: entry for entry in catalog}

    flux = by_ref["black-forest-labs/FLUX.2-klein-4B"]
    assert flux.capabilities == ["image_generation", "image_editing"]
    assert flux.metadata["local_profile"]["fits_rtx_3090"] is True
    assert flux.metadata["quantization"] == "nf4"

    qwen = by_ref["Qwen/Qwen-Image-2.0"]
    assert "image_editing" in qwen.capabilities
    assert qwen.metadata["runtime_options"] == ["local_hf_diffusers", "api"]

    llm_refs = {
        entry.normalized_id
        for entry in catalog
        if "text_chat" in entry.capabilities and "planner_text" in entry.capabilities
    }
    assert {
        "Qwen/Qwen3-32B-Instruct",
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
        "openai/gpt-oss-20b",
    }.issubset(llm_refs)
