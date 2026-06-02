from forgeflow_api.adapters.hf_image import build_image_runtime_profile


def test_runtime_profile_caps_resolution_for_small_gpus():
    profile = build_image_runtime_profile(
        requested_height=1024,
        requested_width=1024,
        requested_steps=8,
        gpu_total_gb=12,
        cuda_available=True,
        local_model_path_exists=True,
    )

    assert profile.height == 384
    assert profile.width == 384
    assert profile.num_inference_steps == 3
    assert profile.enable_4bit_quantization is True

