from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sse_starlette import EventSourceResponse
from pydantic import BaseModel, Field

from forgeflow_api.domain.models import MessageCreate, SessionCreate


router = APIRouter(prefix="/chat", tags=["chat"])


class SessionUpdate(BaseModel):
    title: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


@router.post("/sessions")
def create_session(request: Request, payload: SessionCreate):
    return request.app.state.container.sessions.create_session(payload)


@router.get("/sessions")
def list_sessions(request: Request, include_archived: bool = Query(default=False)):
    sessions = request.app.state.container.store.list_sessions()
    if include_archived:
        return [session for session in sessions]
    return [session for session in sessions if not session.metadata.get("archived", False)]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, request: Request):
    try:
        return request.app.state.container.sessions.get_session_bundle(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc


@router.patch("/sessions/{session_id}")
def update_session(session_id: str, payload: SessionUpdate, request: Request):
    try:
        return request.app.state.container.sessions.update_session(
            session_id,
            title=payload.title,
            metadata=payload.metadata,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, request: Request):
    try:
        request.app.state.container.sessions.delete_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/messages", status_code=status.HTTP_202_ACCEPTED)
def create_message(session_id: str, payload: MessageCreate, request: Request):
    message, run = request.app.state.container.conversations.handle_user_message(session_id, payload)
    return {"message": message, "run": run}


@router.get("/sessions/{session_id}/events")
async def list_events(session_id: str, request: Request):
    accept = request.headers.get("accept", "")
    if "text/event-stream" not in accept:
        events = request.app.state.container.store.list_events(session_id)
        return {"events": [event.model_dump(mode="json") for event in events]}

    if request.query_params.get("live") != "1":
        events = request.app.state.container.store.list_events(session_id)

        async def backlog_generator():
            for event in events:
                yield {
                    "event": event.type,
                    "data": event.model_dump_json(),
                }

        return EventSourceResponse(backlog_generator())

    async def event_generator():
        last_seq = 0
        while True:
            if await request.is_disconnected():
                break
            rows = request.app.state.container.store.list_events_after(session_id, last_seq)
            if not rows:
                await asyncio.sleep(0.5)
                continue
            for seq, event in rows:
                last_seq = seq
                yield {
                    "event": event.type,
                    "data": event.model_dump_json(),
                }

    return EventSourceResponse(event_generator())
