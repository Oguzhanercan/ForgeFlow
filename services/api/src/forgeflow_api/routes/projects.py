from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi import HTTPException, Request


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}/catalog")
def project_catalog(project_id: str, request: Request):
    path = request.app.state.container.artifact_store.run_dir(project_id) / "master_catalog.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="catalog not found")
    return json.loads(path.read_text())
