from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from forgeflow_api.adapters.base import AdapterHealth, Object3DAdapter


def resolve_hunyuan_runtime_python() -> str:
    return os.getenv(
        "FORGEFLOW_HUNYUAN_RUNTIME_PYTHON",
        os.getenv(
            "FORGEFLOW_LOCAL_RUNTIME_PYTHON",
            "/home/oguzhan/Desktop/hunyuan3d-2.1/.venv/bin/python",
        ),
    )


class Hunyuan3DAdapter(Object3DAdapter):
    def __init__(
        self,
        root_dir: str | None = None,
        *,
        python_bin: str | None = None,
        script_path: str | None = None,
    ) -> None:
        self.root_dir = Path(root_dir or os.getenv("HUNYUAN3D_ROOT", "/home/oguzhan/Desktop/hunyuan3d-2.1"))
        self.python_bin = python_bin or resolve_hunyuan_runtime_python()
        self.script_path = script_path or str(Path(__file__).resolve().parents[1] / "scripts" / "run_hunyuan3d.py")

    def healthcheck(self) -> AdapterHealth:
        python_path = Path(self.python_bin)
        script_path = Path(self.script_path)
        if not self.root_dir.exists():
            return AdapterHealth(ok=False, detail=f"missing_root:{self.root_dir}")
        if not python_path.exists():
            return AdapterHealth(ok=False, detail=f"missing_python:{python_path}")
        if not script_path.exists():
            return AdapterHealth(ok=False, detail=f"missing_script:{script_path}")
        return AdapterHealth(ok=True, detail=f"external_runtime:{self.root_dir}")

    def generate(self, image_path: Path, output_dir: Path, name: str):
        output_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.python_bin,
            self.script_path,
            "--root-dir",
            str(self.root_dir),
            "--image-path",
            str(image_path),
            "--output-dir",
            str(output_dir),
            "--name",
            name,
        ]
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=3600,
        )
        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            detail = stderr or stdout or "3d generation subprocess failed"
            raise RuntimeError(detail)
        payload = {}
        stdout = (completed.stdout or "").strip()
        if stdout:
            try:
                payload = json.loads(stdout)
            except json.JSONDecodeError:
                payload = {}
        initial_glb = payload.get("initial_glb") or str(output_dir / f"{name}_initial.glb")
        asset_path = payload.get("asset_path") or str(output_dir / f"{name}.glb")
        if not Path(asset_path).exists():
            raise RuntimeError("3d generation finished without producing output")
        return {
            "status": "generated",
            "initial_glb": str(initial_glb),
            "asset_path": str(asset_path),
        }
