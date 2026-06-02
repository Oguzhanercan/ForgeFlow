from __future__ import annotations

import base64
import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

from forgeflow_api.adapters.base import AdapterHealth, ImageGenerationAdapter, Object3DAdapter, TextChatAdapter, VisionReviewAdapter


NVIDIA_BUILD_API_KEY_ENV = "NVIDIA_BUILD_API_KEY"
NVIDIA_API_KEY_ENV = "NVIDIA_API_KEY"
NVIDIA_ASSET_CREATE_URL = "https://api.nvcf.nvidia.com/v2/nvcf/assets"


def resolve_nvidia_api_key() -> str:
    return os.getenv(NVIDIA_API_KEY_ENV) or os.getenv(NVIDIA_BUILD_API_KEY_ENV) or ""


def _chat_template_kwargs(model: str) -> dict[str, bool]:
    lowered = model.lower()
    if "glm" in lowered:
        return {"enable_thinking": True, "clear_thinking": False}
    return {"thinking": True}


def _auth_headers(*, accept: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {resolve_nvidia_api_key()}",
        "Accept": accept,
    }


def _encode_data_url(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def _decode_data_url(value: str) -> bytes:
    _, encoded = value.split(",", 1)
    return base64.b64decode(encoded)


def _decode_artifact_payload(value: str) -> bytes:
    if value.startswith("data:"):
        return _decode_data_url(value)
    return base64.b64decode(value)


def _guess_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    return "application/octet-stream"


def _upload_nvidia_asset(client: httpx.Client, path: Path, *, description: str) -> str:
    mime_type = _guess_mime_type(path)
    create_response = client.post(
        NVIDIA_ASSET_CREATE_URL,
        headers={
            **_auth_headers(accept="application/json"),
            "Content-Type": "application/json",
        },
        json={"contentType": mime_type, "description": description},
    )
    create_response.raise_for_status()
    asset = create_response.json()
    asset_id = asset.get("assetId")
    upload_url = asset.get("uploadUrl")
    if not asset_id or not upload_url:
        raise RuntimeError("nvidia asset creation response missing assetId or uploadUrl")
    upload_response = client.put(
        upload_url,
        headers={
            "Content-Type": mime_type,
            "x-amz-meta-nvcf-asset-description": description,
        },
        content=path.read_bytes(),
    )
    upload_response.raise_for_status()
    return str(asset_id)


class NVIDIAKimiAdapter(TextChatAdapter, VisionReviewAdapter):
    capability = "text_chat"

    def __init__(self, model: str = "moonshotai/kimi-k2.5") -> None:
        self.model = model

    def healthcheck(self) -> AdapterHealth:
        key = resolve_nvidia_api_key()
        if not key:
            return AdapterHealth(ok=False, detail="missing_nvidia_build_api_key")
        return AdapterHealth(ok=True, detail=f"ready:{self.model}")

    def generate(self, prompt: str, system_prompt: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [],
            "max_tokens": 16384,
            "temperature": 1.0,
            "top_p": 1.0,
            "stream": True,
            "chat_template_kwargs": _chat_template_kwargs(self.model),
        }
        if system_prompt:
            payload["messages"].append({"role": "system", "content": system_prompt})
        payload["messages"].append({"role": "user", "content": prompt})
        content_chunks: list[str] = []
        with httpx.Client(timeout=60) as client:
            with client.stream(
                "POST",
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers=_auth_headers(accept="text/event-stream"),
                json=payload,
            ) as response:
                response.raise_for_status()
                for raw_line in response.iter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
                    if not line.startswith("data: "):
                        continue
                    data = line.removeprefix("data: ").strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = event.get("choices", [{}])[0].get("delta", {})
                    chunk = delta.get("content")
                    if chunk:
                        content_chunks.append(chunk)
        return {
            "provider": "nvidia_build",
            "model": self.model,
            "content": "".join(content_chunks).strip(),
            "status": "ok",
        }

    def review(self, image_paths: list[Path], prompt: str) -> dict[str, Any]:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    *[
                        {"type": "image_url", "image_url": {"url": _encode_data_url(path)}}
                        for path in image_paths
                    ],
                ],
            }
        ]
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 2048,
            "temperature": 0.2,
            "top_p": 0.9,
            "stream": False,
            "chat_template_kwargs": {"thinking": True},
        }
        with httpx.Client(timeout=120) as client:
            response = client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers=_auth_headers(accept="application/json"),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        return {
            "status": "reviewed",
            "model": self.model,
            "result": {
              "pass": True,
              "confidence": 0.75,
              "short_critique": content,
            },
        }


class NVIDIAImageAdapter(ImageGenerationAdapter):
    def __init__(self, model: str = "black-forest-labs/flux.2-klein-4b") -> None:
        self.model = model

    def healthcheck(self) -> AdapterHealth:
        key = resolve_nvidia_api_key()
        if not key:
            return AdapterHealth(ok=False, detail="missing_nvidia_build_api_key")
        return AdapterHealth(ok=True, detail=f"ready:{self.model}")

    def generate(self, prompt: str, output_path: Path, **kwargs: Any) -> dict[str, Any]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        payload: dict[str, Any] = {
            "prompt": prompt,
            "width": kwargs.get("width", 1024),
            "height": kwargs.get("height", 1024),
            "seed": kwargs.get("seed", 0),
            "steps": kwargs.get("num_inference_steps", kwargs.get("steps", 4)),
        }
        source_image_paths = kwargs.get("source_image_paths") or []
        with httpx.Client(timeout=180) as client:
            if source_image_paths:
                asset_id = _upload_nvidia_asset(
                    client, Path(source_image_paths[0]),
                    description=f"ForgeFlow edit input {Path(source_image_paths[0]).name}",
                )
                payload["image"] = f"data:image/png;example_id,{asset_id}"
            response = client.post(
                f"https://ai.api.nvidia.com/v1/genai/{self.model}",
                headers=_auth_headers(accept="application/json"),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        image_value = data.get("image") or data.get("images", [None])[0]
        if image_value is None and data.get("artifacts"):
            image_value = data["artifacts"][0].get("base64")
        if image_value is None:
            raise RuntimeError("nvidia image response missing image payload")
        image_bytes = _decode_artifact_payload(image_value)
        image = Image.open(BytesIO(image_bytes)).convert("RGBA")
        image.save(output_path, format="PNG")
        return {
            "path": str(output_path),
            "status": "generated",
            "provider": "nvidia_build",
            "model": self.model,
        }


class NVIDIATrellisAdapter(Object3DAdapter):
    def __init__(self, model: str = "microsoft/trellis") -> None:
        self.model = model

    def healthcheck(self) -> AdapterHealth:
        key = resolve_nvidia_api_key()
        if not key:
            return AdapterHealth(ok=False, detail="missing_nvidia_build_api_key")
        return AdapterHealth(ok=True, detail=f"ready:{self.model}")

    def generate(self, image_path: Path, output_dir: Path, name: str) -> dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        with httpx.Client(timeout=600) as client:
            description = f"ForgeFlow TRELLIS input {name}"
            asset_id = _upload_nvidia_asset(client, image_path, description=description)
            payload: dict[str, Any] = {
                "image": f"data:image/png;example_id,{asset_id}",
                "slat_cfg_scale": 3,
                "ss_cfg_scale": 7.5,
                "slat_sampling_steps": 25,
                "ss_sampling_steps": 25,
                "seed": 0,
            }
            response = client.post(
                f"https://ai.api.nvidia.com/v1/genai/{self.model}",
                headers=_auth_headers(accept="application/json"),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        glb_value = data.get("glb") or data.get("model")
        if glb_value is None and data.get("artifacts"):
            glb_value = data["artifacts"][0].get("base64")
        if not glb_value:
            raise RuntimeError("nvidia trellis response missing glb/model payload")
        asset_path = output_dir / f"{name}.glb"
        asset_path.write_bytes(_decode_artifact_payload(glb_value))

        obj_path = output_dir / f"{name}.obj"
        obj_value = data.get("obj")
        if obj_value:
            obj_path.write_bytes(_decode_artifact_payload(obj_value))

        initial_glb = output_dir / f"{name}_initial.glb"
        initial_glb.write_bytes(asset_path.read_bytes())
        return {
            "status": "generated",
            "asset_path": str(asset_path),
            "initial_glb": str(initial_glb),
            "obj_path": str(obj_path),
            "provider": "nvidia_build",
            "model": self.model,
        }
