from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel


class ReviewModePayload(BaseModel):
    review_mode: str


router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("")
def list_runs(request: Request):
    return request.app.state.container.store.list_runs()


@router.get("/{run_id}")
def get_run(run_id: str, request: Request):
    try:
        run = request.app.state.container.store.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="run not found") from exc
    artifacts = request.app.state.container.store.list_artifacts_for_run(run_id)
    return {
        **run.model_dump(mode="json"),
        "artifacts": [artifact.model_dump(mode="json") for artifact in artifacts],
    }


@router.post("/{run_id}/retry")
def retry_run(run_id: str, request: Request):
    try:
        run = request.app.state.container.runs.retry_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="run not found") from exc
    return {"run_id": run.id, "status": run.status, "intent_type": run.intent_type}


@router.post("/{run_id}/review-mode")
def set_review_mode(run_id: str, payload: ReviewModePayload, request: Request):
    try:
        run = request.app.state.container.runs.set_review_mode(run_id, payload.review_mode)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="run not found") from exc
    return {"run_id": run.id, "status": run.status, "review_mode": run.review_mode}
