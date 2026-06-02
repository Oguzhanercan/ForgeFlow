from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image

from forgeflow_api.adapters.hf_image import HuggingFaceDiffusersImageAdapter
from forgeflow_api.adapters.hunyuan3d import Hunyuan3DAdapter


def test_image_adapter_uses_flux_runtime_env(monkeypatch):
    monkeypatch.setenv("FORGEFLOW_FLUX_RUNTIME_PYTHON", "/runtime/flux-python")
    monkeypatch.delenv("FORGEFLOW_LOCAL_RUNTIME_PYTHON", raising=False)

    adapter = HuggingFaceDiffusersImageAdapter("/models/flux")

    assert adapter.python_bin == "/runtime/flux-python"


def test_hunyuan_adapter_uses_hunyuan_runtime_env(monkeypatch):
    monkeypatch.setenv("FORGEFLOW_HUNYUAN_RUNTIME_PYTHON", "/runtime/hunyuan-python")
    monkeypatch.delenv("FORGEFLOW_LOCAL_RUNTIME_PYTHON", raising=False)

    adapter = Hunyuan3DAdapter("/repo/hunyuan3d")

    assert adapter.python_bin == "/runtime/hunyuan-python"


def test_image_adapter_uses_external_runtime_process(monkeypatch, tmp_path: Path):
    output_path = tmp_path / "image.png"
    recorded: dict[str, object] = {}

    def fake_run(cmd, **kwargs):
        recorded["cmd"] = cmd
        output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(output_path)
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    adapter = HuggingFaceDiffusersImageAdapter(
        "/models/flux",
        python_bin="/runtime/python",
        script_path="/tmp/run_flux_image.py",
    )

    result = adapter.generate("ceremonial shield", output_path)

    assert result["status"] == "generated"
    assert result["path"] == str(output_path)
    assert recorded["cmd"][0] == "/runtime/python"
    assert "--model-path" in recorded["cmd"]
    assert "--output-path" in recorded["cmd"]


def test_image_adapter_passes_source_image_for_editing(monkeypatch, tmp_path: Path):
    output_path = tmp_path / "edited.png"
    source_path = tmp_path / "source.png"
    Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(source_path)
    recorded: dict[str, object] = {}

    def fake_run(cmd, **kwargs):
        recorded["cmd"] = cmd
        output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(output_path)
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    adapter = HuggingFaceDiffusersImageAdapter(
        "/models/flux-edit",
        python_bin="/runtime/python",
        script_path="/tmp/run_flux_image.py",
    )

    result = adapter.generate("add scratches", output_path, source_image_paths=[source_path])

    assert result["status"] == "generated"
    assert "--source-image-path" in recorded["cmd"]
    source_index = recorded["cmd"].index("--source-image-path")
    assert recorded["cmd"][source_index + 1] == str(source_path)


def test_hunyuan_adapter_uses_external_runtime_process(monkeypatch, tmp_path: Path):
    output_dir = tmp_path / "assets"
    image_path = tmp_path / "prepared.png"
    Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(image_path)
    recorded: dict[str, object] = {}

    def fake_run(cmd, **kwargs):
        recorded["cmd"] = cmd
        target = output_dir / "shield.glb"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"glTF")
        initial = output_dir / "shield_initial.glb"
        initial.write_bytes(b"glTF")
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    adapter = Hunyuan3DAdapter(
        "/repo/hunyuan3d",
        python_bin="/runtime/python",
        script_path="/tmp/run_hunyuan3d.py",
    )

    result = adapter.generate(image_path, output_dir, "shield")

    assert result["status"] == "generated"
    assert result["asset_path"] == str(output_dir / "shield.glb")
    assert recorded["cmd"][0] == "/runtime/python"
    assert "--image-path" in recorded["cmd"]
    assert "--output-dir" in recorded["cmd"]
