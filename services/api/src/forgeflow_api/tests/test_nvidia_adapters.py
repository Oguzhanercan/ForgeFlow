from __future__ import annotations

import base64
from pathlib import Path

from PIL import Image

from forgeflow_api.adapters.nvidia import (
    NVIDIAImageAdapter,
    NVIDIAKimiAdapter,
    NVIDIATrellisAdapter,
    resolve_nvidia_api_key,
)


def _write_png(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 8), (0, 0, 0, 0)).save(path)


def test_nvidia_key_resolution_has_no_hardcoded_fallback(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_BUILD_API_KEY", raising=False)

    assert resolve_nvidia_api_key() == ""
    assert NVIDIAKimiAdapter().healthcheck().ok is False


def test_nvidia_kimi_adapter_uses_chat_endpoint_and_streams(monkeypatch):
    recorded: dict[str, object] = {}

    class DummyResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def iter_lines(self):
            lines = [
                b'data: {"choices":[{"delta":{"content":"Merhaba "}}]}',
                b'data: {"choices":[{"delta":{"content":"dunya"}}]}',
                b"data: [DONE]",
            ]
            for line in lines:
                yield line

    class DummyClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        class _StreamContext:
            def __init__(self, response):
                self.response = response

            def __enter__(self):
                return self.response

            def __exit__(self, exc_type, exc, tb):
                return False

        def stream(self, method, url, headers=None, json=None):
            recorded["method"] = method
            recorded["url"] = url
            recorded["headers"] = headers
            recorded["json"] = json
            return self._StreamContext(DummyResponse())

    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    monkeypatch.setattr("forgeflow_api.adapters.nvidia.httpx.Client", lambda timeout=60: DummyClient())

    adapter = NVIDIAKimiAdapter()
    result = adapter.generate("selam", system_prompt="test")

    assert recorded["method"] == "POST"
    assert recorded["url"] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert recorded["json"]["stream"] is True
    assert recorded["json"]["model"] == "moonshotai/kimi-k2.5"
    assert recorded["json"]["chat_template_kwargs"] == {"thinking": True}
    assert result["content"] == "Merhaba dunya"


def test_nvidia_glm_adapter_uses_glm_thinking_flags(monkeypatch):
    recorded: dict[str, object] = {}

    class DummyResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def iter_lines(self):
            lines = [
                b'data: {"choices":[{"delta":{"content":"Merhaba "}}]}',
                b'data: {"choices":[{"delta":{"content":"dunya"}}]}',
                b"data: [DONE]",
            ]
            for line in lines:
                yield line

    class DummyClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        class _StreamContext:
            def __init__(self, response):
                self.response = response

            def __enter__(self):
                return self.response

            def __exit__(self, exc_type, exc, tb):
                return False

        def stream(self, method, url, headers=None, json=None):
            recorded["method"] = method
            recorded["url"] = url
            recorded["headers"] = headers
            recorded["json"] = json
            return self._StreamContext(DummyResponse())

    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    monkeypatch.setattr("forgeflow_api.adapters.nvidia.httpx.Client", lambda timeout=60: DummyClient())

    adapter = NVIDIAKimiAdapter("z-ai/glm-5.1")
    result = adapter.generate("selam", system_prompt="test")

    assert recorded["method"] == "POST"
    assert recorded["url"] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert recorded["json"]["stream"] is True
    assert recorded["json"]["chat_template_kwargs"] == {"enable_thinking": True, "clear_thinking": False}
    assert result["content"] == "Merhaba dunya"


def test_nvidia_image_adapter_uploads_source_images_when_editing(monkeypatch, tmp_path: Path):
    source = tmp_path / "input.png"
    target = tmp_path / "output.png"
    _write_png(source)
    png_bytes = source.read_bytes()
    response_payload = {
        "image": f"data:image/png;base64,{base64.b64encode(png_bytes).decode('utf-8')}",
    }
    recorded: list[tuple[str, str, object | None, object | None]] = []

    class DummyResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    class DummyClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            recorded.append(("post", url, headers, json))
            if url == "https://api.nvcf.nvidia.com/v2/nvcf/assets":
                return DummyResponse(
                    {
                        "assetId": "asset-123",
                        "uploadUrl": "https://upload.example.com/asset-123",
                    }
                )
            return DummyResponse(response_payload)

        def put(self, url, headers=None, content=None):
            recorded.append(("put", url, headers, content))
            return DummyResponse({})

    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    monkeypatch.setattr("forgeflow_api.adapters.nvidia.httpx.Client", lambda timeout=180: DummyClient())

    adapter = NVIDIAImageAdapter("black-forest-labs/flux.2-klein-4b")
    result = adapter.generate("edit this", target, source_image_paths=[source])

    assert len(recorded) == 3
    create_call = recorded[0]
    upload_call = recorded[1]
    infer_call = recorded[2]
    assert create_call[1] == "https://api.nvcf.nvidia.com/v2/nvcf/assets"
    assert upload_call[0] == "put"
    assert upload_call[1] == "https://upload.example.com/asset-123"
    assert infer_call[1] == "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"
    assert infer_call[3]["image"] == "data:image/png;example_id,asset-123"
    assert target.exists()
    assert result["status"] == "generated"


def test_nvidia_image_adapter_accepts_artifacts_base64_response(monkeypatch, tmp_path: Path):
    target = tmp_path / "output.png"
    image = Image.new("RGB", (8, 8), (180, 120, 60))
    temp = tmp_path / "artifact.jpg"
    image.save(temp, format="JPEG")
    encoded = base64.b64encode(temp.read_bytes()).decode("utf-8")

    class DummyResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"artifacts": [{"base64": encoded}]}

    class DummyClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            return DummyResponse()

    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    monkeypatch.setattr("forgeflow_api.adapters.nvidia.httpx.Client", lambda timeout=180: DummyClient())

    adapter = NVIDIAImageAdapter("black-forest-labs/flux.2-klein-4b")
    result = adapter.generate("generate", target)

    assert result["status"] == "generated"
    assert target.exists()
    assert Image.open(target).format == "PNG"


def test_nvidia_trellis_adapter_decodes_obj_and_glb(monkeypatch, tmp_path: Path):
    source = tmp_path / "input.png"
    output_dir = tmp_path / "assets"
    _write_png(source)
    glb_bytes = b"glTFbinary"
    obj_bytes = b"o test\n"
    recorded: list[tuple[str, str, object | None, object | None]] = []

    class DummyResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    class DummyClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            recorded.append(("post", url, headers, json))
            if url == "https://api.nvcf.nvidia.com/v2/nvcf/assets":
                return DummyResponse(
                    {
                        "assetId": "asset-123",
                        "uploadUrl": "https://upload.example.com/asset-123",
                        "contentType": "image/png",
                        "description": "ForgeFlow TRELLIS input shield",
                    }
                )
            return DummyResponse(
                {
                    "glb": f"data:model/gltf-binary;base64,{base64.b64encode(glb_bytes).decode('utf-8')}",
                    "obj": f"data:text/plain;base64,{base64.b64encode(obj_bytes).decode('utf-8')}",
                }
            )

        def put(self, url, headers=None, content=None):
            recorded.append(("put", url, headers, content))
            return DummyResponse({})

    monkeypatch.setenv("NVIDIA_BUILD_API_KEY", "test-nvidia-key")
    monkeypatch.setattr("forgeflow_api.adapters.nvidia.httpx.Client", lambda timeout=600: DummyClient())

    adapter = NVIDIATrellisAdapter("microsoft/trellis")
    result = adapter.generate(source, output_dir, "shield")

    create_call = recorded[0]
    upload_call = recorded[1]
    infer_call = recorded[2]
    assert create_call[1] == "https://api.nvcf.nvidia.com/v2/nvcf/assets"
    assert create_call[3] == {"contentType": "image/png", "description": "ForgeFlow TRELLIS input shield"}
    assert upload_call[0] == "put"
    assert upload_call[1] == "https://upload.example.com/asset-123"
    assert upload_call[2]["Content-Type"] == "image/png"
    assert upload_call[2]["x-amz-meta-nvcf-asset-description"] == "ForgeFlow TRELLIS input shield"
    assert infer_call[1] == "https://ai.api.nvidia.com/v1/genai/microsoft/trellis"
    assert infer_call[3]["image"] == "data:image/png;example_id,asset-123"
    assert result["asset_path"].endswith("shield.glb")
    assert Path(result["asset_path"]).read_bytes() == glb_bytes
    assert Path(result["obj_path"]).read_bytes() == obj_bytes
