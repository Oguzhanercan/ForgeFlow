from __future__ import annotations

import json
import os
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

from forgeflow_api.adapters.base import AdapterHealth, ImageGenerationAdapter


def resolve_flux_runtime_python() -> str:
    return os.getenv(
        "FORGEFLOW_FLUX_RUNTIME_PYTHON",
        os.getenv(
            "FORGEFLOW_LOCAL_RUNTIME_PYTHON",
            "/home/oguzhan/Desktop/hunyuan3d-2.1/pipelines/flux_hunyuan_batch/.venv_flux/bin/python",
        ),
    )


@dataclass(frozen=True)
class ImageRuntimeProfile:
    device: str
    dtype_name: str
    height: int
    width: int
    num_inference_steps: int
    guidance_scale: float
    enable_attention_slicing: bool
    local_files_only: bool
    low_cpu_mem_usage: bool
    enable_4bit_quantization: bool
    quantized_components: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def build_image_runtime_profile(
    *,
    requested_height: int,
    requested_width: int,
    requested_steps: int,
    gpu_total_gb: int | None,
    cuda_available: bool,
    local_model_path_exists: bool = True,
    guidance_scale: float = 1.0,
) -> ImageRuntimeProfile:
    if not cuda_available:
        return ImageRuntimeProfile(
            device="cpu",
            dtype_name="float32",
            height=requested_height,
            width=requested_width,
            num_inference_steps=requested_steps,
            guidance_scale=guidance_scale,
            enable_attention_slicing=False,
            local_files_only=local_model_path_exists,
            low_cpu_mem_usage=True,
            enable_4bit_quantization=False,
            quantized_components=(),
        )

    effective_height = requested_height
    effective_width = requested_width
    effective_steps = requested_steps

    if requested_height * requested_width > 512 * 512:
        effective_height = 512
        effective_width = 512
    if requested_steps > 4:
        effective_steps = 4
    if gpu_total_gb is not None and gpu_total_gb < 16:
        effective_height = min(effective_height, 384)
        effective_width = min(effective_width, 384)
        effective_steps = min(effective_steps, 3)

    return ImageRuntimeProfile(
        device="cuda",
        dtype_name="bfloat16",
        height=effective_height,
        width=effective_width,
        num_inference_steps=effective_steps,
        guidance_scale=guidance_scale,
        enable_attention_slicing=True,
        local_files_only=local_model_path_exists,
        low_cpu_mem_usage=True,
        enable_4bit_quantization=True,
        quantized_components=("text_encoder", "transformer"),
    )


class HuggingFaceDiffusersImageAdapter(ImageGenerationAdapter):
    def __init__(
        self,
        model_path: str,
        *,
        python_bin: str | None = None,
        script_path: str | None = None,
    ) -> None:
        self.model_path = model_path
        self.python_bin = python_bin or resolve_flux_runtime_python()
        self.script_path = script_path or str(Path(__file__).resolve().parents[1] / "scripts" / "run_flux_image.py")

    def healthcheck(self) -> AdapterHealth:
        python_path = Path(self.python_bin)
        script_path = Path(self.script_path)
        if not python_path.exists():
            return AdapterHealth(ok=False, detail=f"missing_python:{python_path}")
        if not script_path.exists():
            return AdapterHealth(ok=False, detail=f"missing_script:{script_path}")
        return AdapterHealth(ok=True, detail=f"external_runtime:{python_path}")

    def generate(self, prompt: str, output_path: Path, **kwargs):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.python_bin,
            self.script_path,
            "--model-path",
            self.model_path,
            "--prompt",
            prompt,
            "--output-path",
            str(output_path),
            "--height",
            str(kwargs.get("height", 768)),
            "--width",
            str(kwargs.get("width", 768)),
            "--guidance-scale",
            str(kwargs.get("guidance_scale", 1.0)),
            "--num-inference-steps",
            str(kwargs.get("num_inference_steps", 4)),
            "--seed",
            str(kwargs.get("seed", 1000)),
        ]
        source_image_paths = kwargs.get("source_image_paths") or []
        if source_image_paths:
            cmd.extend(["--source-image-path", str(source_image_paths[0])])
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=kwargs.get("timeout_seconds", 1800),
        )
        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            detail = stderr or stdout or "image generation subprocess failed"
            raise RuntimeError(detail)
        if not output_path.exists():
            raise RuntimeError("image generation finished without producing output")
        runtime: dict[str, object] | None = None
        stdout = (completed.stdout or "").strip()
        if stdout:
            try:
                runtime = json.loads(stdout)
            except json.JSONDecodeError:
                runtime = {"stdout": stdout}
        return {
            "path": str(output_path),
            "status": "generated",
            "runtime": runtime or {},
        }
