from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from slugify import slugify

from forgeflow_api.domain.asset_pack import build_master_catalog


class ArtifactStore:
    def __init__(self, root_dir: str | Path) -> None:
        self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def run_dir(self, run_id: str) -> Path:
        target = self.root_dir / slugify(run_id)
        target.mkdir(parents=True, exist_ok=True)
        return target

    def stage_dir(self, run_id: str, stage: str) -> Path:
        target = self.run_dir(run_id) / stage
        target.mkdir(parents=True, exist_ok=True)
        return target

    def build_path(self, run_id: str, stage: str, filename: str) -> Path:
        return self.stage_dir(run_id, stage) / filename

    def write_catalog(self, run_id: str, artifacts: list[dict[str, Any]]) -> Path:
        catalog = build_master_catalog(run_id=run_id, artifacts=artifacts)
        path = self.run_dir(run_id) / "master_catalog.json"
        path.write_text(json.dumps(catalog, indent=2))
        return path

    def write_json(self, run_id: str, stage: str, filename: str, payload: dict[str, Any]) -> Path:
        path = self.build_path(run_id, stage, filename)
        path.write_text(json.dumps(payload, indent=2))
        return path
