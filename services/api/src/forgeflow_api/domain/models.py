from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


IntentType = Literal[
    "chat_only",
    "single_object_image",
    "single_object_3d",
    "image_plus_3d",
    "asset_pack",
    "mixed_request",
]
ReviewMode = Literal["manual", "automatic_vlm", "hybrid"]
ArtifactKind = Literal[
    "raw_image",
    "prepared_image",
    "image_review",
    "object3d",
    "object3d_review",
    "catalog",
]
SourceKind = Literal[
    "local_hf_transformers",
    "local_hf_diffusers",
    "local_custom",
    "api_openrouter",
    "api_generic",
]


class PipelinePlan(BaseModel):
    id: str = Field(default_factory=lambda: f"plan_{uuid4().hex}")
    intent_type: IntentType
    requested_outputs: list[str]
    review_mode: ReviewMode | None = None
    stages: list[str]
    grouping_strategy: str
    needs_user_choice: bool = False
    system_prompt_profile: str
    planner_notes: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class ProviderModel(BaseModel):
    id: str = Field(default_factory=lambda: f"provider_{uuid4().hex}")
    label: str
    normalized_id: str
    source_kind: SourceKind
    capabilities: list[str]
    status: str = "active"
    stage_overrides: dict[str, str] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ModelCatalogEntry(BaseModel):
    id: str
    label: str
    normalized_id: str
    source_kind: SourceKind
    capabilities: list[str]
    status: str = "recommended"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewDecision(BaseModel):
    status: str
    requires_user_action: bool = False
    reviewer_type: str | None = None


class ChatSession(BaseModel):
    id: str = Field(default_factory=lambda: f"session_{uuid4().hex}")
    title: str
    created_at: datetime = Field(default_factory=utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: f"msg_{uuid4().hex}")
    session_id: str
    role: str
    content: str
    created_at: datetime = Field(default_factory=utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Run(BaseModel):
    id: str = Field(default_factory=lambda: f"run_{uuid4().hex}")
    session_id: str
    source_message_id: str | None = None
    status: str
    intent_type: IntentType
    review_mode: ReviewMode | None = None
    grouping_strategy: str
    plan: PipelinePlan
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class RunEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"evt_{uuid4().hex}")
    session_id: str
    run_id: str | None = None
    type: str
    payload: dict[str, Any]
    created_at: datetime = Field(default_factory=utcnow)


class Artifact(BaseModel):
    id: str = Field(default_factory=lambda: f"asset_{uuid4().hex}")
    run_id: str
    session_id: str
    stage: str
    kind: ArtifactKind
    status: str
    title: str
    group_key: str = "default"
    path: str
    mime_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)


class MessageCreate(BaseModel):
    role: str
    content: str
    review_mode: ReviewMode | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionCreate(BaseModel):
    title: str
    metadata: dict[str, Any] = Field(default_factory=dict)
