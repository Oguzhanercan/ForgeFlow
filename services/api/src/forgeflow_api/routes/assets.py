from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from forgeflow_api.domain.models import Artifact, Run, RunEvent, utcnow


class AssetReviewPayload(BaseModel):
    decision: str
    note: str | None = None


router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_asset(
    request: Request,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
):
    try:
        request.app.state.container.store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc

    suffix = Path(file.filename or "upload.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(status_code=400, detail="unsupported file type")

    run = Run(
        session_id=session_id,
        status="completed",
        intent_type="chat_only",
        grouping_strategy="imports",
        plan=request.app.state.container.planner._chat_only_plan("Uploaded asset reference."),
    )
    request.app.state.container.store.add_run(run)

    safe_title = (title or Path(file.filename or "uploaded-image").stem or "uploaded-image").strip()
    filename = f"{uuid4().hex}{suffix}"
    output_path = request.app.state.container.artifact_store.build_path(run.id, "upload", filename)
    output_path.write_bytes(await file.read())
    mime_type = file.content_type or ("image/png" if suffix == ".png" else "application/octet-stream")

    artifact = Artifact(
        run_id=run.id,
        session_id=session_id,
        stage="upload",
        kind="raw_image",
        status="uploaded",
        title=safe_title,
        group_key="imports",
        path=str(output_path),
        mime_type=mime_type,
        metadata={"uploaded": True, "original_filename": file.filename},
    )
    request.app.state.container.store.add_artifact(artifact)
    request.app.state.container.store.append_event(
        RunEvent(
            session_id=session_id,
            run_id=run.id,
            type="run.created",
            payload={"run_id": run.id, "status": run.status, "intent_type": run.intent_type, "grouping_strategy": run.grouping_strategy},
        )
    )
    request.app.state.container.store.append_event(
        RunEvent(
            session_id=session_id,
            run_id=run.id,
            type="asset.uploaded",
            payload=artifact.model_dump(mode="json"),
        )
    )
    return {"artifact": artifact.model_dump(mode="json"), "run": run.model_dump(mode="json")}


@router.post("/{asset_id}/reviews")
def review_asset(asset_id: str, payload: AssetReviewPayload, request: Request):
    try:
        artifact = request.app.state.container.store.get_artifact(asset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="asset not found") from exc
    request.app.state.container.store.add_asset_review(
        asset_id,
        decision=payload.decision,
        note=payload.note,
        created_at=utcnow().isoformat(),
    )
    artifact.status = payload.decision
    request.app.state.container.store.update_artifact(artifact)
    return {
        "asset_id": asset_id,
        "decision": payload.decision,
        "note": payload.note,
        "reviews": request.app.state.container.store.list_asset_reviews(asset_id),
    }


@router.get("/{asset_id}", response_model=Artifact)
def get_asset(asset_id: str, request: Request):
    try:
        return request.app.state.container.store.get_artifact(asset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="asset not found") from exc


@router.get("/{asset_id}/download")
@router.get("/{asset_id}/download.glb")
def download_asset(asset_id: str, request: Request):
    try:
        artifact = request.app.state.container.store.get_artifact(asset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="asset not found") from exc
    return FileResponse(artifact.path, media_type=artifact.mime_type, filename=artifact.path.split("/")[-1])


@router.post("/{asset_id}/remove-background", status_code=status.HTTP_201_CREATED)
def remove_background(asset_id: str, request: Request):
    """Remove background from an image using BEN2 model."""
    try:
        source_artifact = request.app.state.container.store.get_artifact(asset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="asset not found") from exc

    if source_artifact.kind not in {"raw_image", "prepared_image"}:
        raise HTTPException(status_code=400, detail="asset must be an image")

    python_bin = os.getenv(
        "FORGEFLOW_BEN2_PYTHON",
        os.getenv(
            "FORGEFLOW_FLUX_RUNTIME_PYTHON",
            os.getenv("FORGEFLOW_LOCAL_RUNTIME_PYTHON", sys.executable),
        ),
    )

    script_path = str(
        Path(__file__).resolve().parents[1] / "scripts" / "run_ben2_bgremove.py"
    )

    output_filename = f"nobg_{uuid4().hex}.png"
    output_path = request.app.state.container.artifact_store.build_path(
        source_artifact.run_id, "bgremove", output_filename
    )

    cmd = [
        python_bin, script_path,
        "--input-path", source_artifact.path,
        "--output-path", str(output_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="background removal timed out") from exc

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or "background removal failed"
        raise HTTPException(status_code=500, detail=detail)

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="background removal produced no output")

    new_artifact = Artifact(
        run_id=source_artifact.run_id,
        session_id=source_artifact.session_id,
        stage="bgremove",
        kind="prepared_image",
        status="generated",
        title=f"{source_artifact.title} (no bg)",
        group_key=source_artifact.group_key,
        path=str(output_path),
        mime_type="image/png",
        metadata={
            "source_artifact_id": asset_id,
            "operation": "background_removal",
            "model": "PramaLLC/BEN2",
        },
    )
    request.app.state.container.store.add_artifact(new_artifact)

    # Emit event so the frontend picks up the new artifact
    request.app.state.container.store.append_event(
        RunEvent(
            session_id=source_artifact.session_id,
            run_id=source_artifact.run_id,
            type="asset.uploaded",
            payload=new_artifact.model_dump(mode="json"),
        )
    )

    return {"artifact": new_artifact.model_dump(mode="json")}
