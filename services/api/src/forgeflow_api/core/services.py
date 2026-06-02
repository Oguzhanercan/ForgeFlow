from __future__ import annotations

import re
from typing import Any

from forgeflow_api.core.store import SQLiteStore
from forgeflow_api.domain.models import ChatMessage, ChatSession, MessageCreate, PipelinePlan, Run, RunEvent, SessionCreate, utcnow
from forgeflow_api.domain.planner import RequestPlanner
from forgeflow_api.domain.review import ReviewPolicyEngine


class SessionService:
    def __init__(self, store: SQLiteStore) -> None:
        self.store = store

    def create_session(self, payload: SessionCreate) -> ChatSession:
        session = ChatSession(title=payload.title, metadata=payload.metadata)
        self.store.create_session(session)
        return session

    def add_user_message(self, session_id: str, payload: MessageCreate) -> ChatMessage:
        message = ChatMessage(
            session_id=session_id,
            role=payload.role,
            content=payload.content,
            metadata={**payload.metadata, **({"review_mode": payload.review_mode} if payload.review_mode else {})},
        )
        self.store.add_message(message)
        self.store.append_event(
            RunEvent(session_id=session_id, type="message.created", payload=message.model_dump(mode="json"))
        )
        return message

    def get_session_bundle(self, session_id: str) -> dict:
        session = self.store.get_session(session_id)
        return {
            "session": session.model_dump(mode="json"),
            "messages": [message.model_dump(mode="json") for message in self.store.list_messages(session_id)],
            "runs": [run.model_dump(mode="json") for run in self.store.list_runs() if run.session_id == session_id],
            "artifacts": [
                artifact.model_dump(mode="json") for artifact in self.store.list_artifacts_for_session(session_id)
            ],
        }

    def update_session_metadata(self, session_id: str, updates: dict[str, Any]) -> ChatSession:
        session = self.store.get_session(session_id)
        session.metadata = _deep_merge_dicts(session.metadata, updates)
        self.store.update_session(session)
        return session

    def update_session(self, session_id: str, *, title: str | None = None, metadata: dict[str, Any] | None = None) -> ChatSession:
        session = self.store.get_session(session_id)
        if title is not None:
            session.title = title.strip() or session.title
        if metadata:
            session.metadata = _deep_merge_dicts(session.metadata, metadata)
        self.store.update_session(session)
        return session

    def delete_session(self, session_id: str) -> None:
        self.store.get_session(session_id)
        self.store.delete_session(session_id)


class RunService:
    def __init__(
        self,
        store: SQLiteStore,
        planner: RequestPlanner,
        review_engine: ReviewPolicyEngine,
    ) -> None:
        self.store = store
        self.planner = planner
        self.review_engine = review_engine

    def queue_run(self, session_id: str, message: ChatMessage, *, session_messages: list[ChatMessage] | None = None) -> Run:
        review_mode = message.metadata.get("review_mode")
        forced_plan_payload = message.metadata.get("forced_plan")
        if isinstance(forced_plan_payload, dict):
            plan = PipelinePlan.model_validate(forced_plan_payload)
        else:
            plan = self.planner.plan(
                message.content,
                review_mode=review_mode,
                allow_llm=False,
                session_messages=session_messages,
                request_metadata=message.metadata,
            )
        session = self.store.get_session(session_id)
        preferred_providers = dict(session.metadata.get("preferred_providers", {}))
        if preferred_providers:
            plan.context["preferred_providers"] = preferred_providers
        selected_provider_id = message.metadata.get("selected_provider_id")
        selected_capability = message.metadata.get("selected_model_capability")
        if not selected_provider_id and selected_capability:
            selected_provider_id = self._resolve_selected_provider_id(message.metadata, str(selected_capability))
        if selected_provider_id and selected_capability:
            plan.context["preferred_providers"] = {
                **plan.context.get("preferred_providers", {}),
                str(selected_capability): str(selected_provider_id),
            }
            if selected_capability == "image_generation":
                plan.context["preferred_providers"].setdefault("image_editing", str(selected_provider_id))
            if selected_capability == "planner_text":
                plan.context["preferred_providers"].setdefault("text_chat", str(selected_provider_id))
        if "assistant_override" in message.metadata:
            plan.context["assistant_override"] = message.metadata["assistant_override"]
        if "control_action" in message.metadata:
            plan.context["control_action"] = message.metadata["control_action"]
        status = "awaiting_review_mode" if plan.needs_user_choice else "queued"
        run = Run(
            session_id=session_id,
            source_message_id=message.id,
            status=status,
            intent_type=plan.intent_type,
            review_mode=plan.review_mode,
            grouping_strategy=plan.grouping_strategy,
            plan=plan,
        )
        self.store.add_run(run)
        self.store.append_event(
            RunEvent(
                session_id=session_id,
                run_id=run.id,
                type="run.created",
                payload={
                    "run_id": run.id,
                    "status": run.status,
                    "intent_type": run.intent_type,
                    "grouping_strategy": run.grouping_strategy,
                },
            )
        )
        if plan.needs_user_choice:
            self.store.append_event(
                RunEvent(
                    session_id=session_id,
                    run_id=run.id,
                    type="review_mode.required",
                    payload={
                        "run_id": run.id,
                        "options": ["manual", "automatic_vlm", "hybrid"],
                    },
            )
        )
        return run

    def _resolve_selected_provider_id(self, metadata: dict[str, Any], capability: str) -> str | None:
        selected_ref = metadata.get("selected_model_ref")
        if not isinstance(selected_ref, str) or not selected_ref.strip():
            return None
        selected_source = metadata.get("selected_model_source")
        normalized_ref = _normalize_model_ref(selected_ref)
        candidates = [
            provider
            for provider in self.store.list_providers()
            if provider.status == "active"
            and capability in provider.capabilities
            and _normalize_model_ref(provider.normalized_id) == normalized_ref
        ]
        if isinstance(selected_source, str):
            for provider in candidates:
                if provider.source_kind == selected_source:
                    return provider.id
        return candidates[0].id if candidates else None

    def set_review_mode(self, run_id: str, review_mode: str, *, session_messages: list[ChatMessage] | None = None) -> Run:
        run = self.store.get_run(run_id)
        user_message = next(
            message for message in self.store.list_messages(run.session_id) if message.id == run.source_message_id
        )
        run.plan = self.planner.plan(
            user_message.content,
            review_mode=review_mode,
            allow_llm=False,
            session_messages=session_messages,
            request_metadata=user_message.metadata,
        )
        session = self.store.get_session(run.session_id)
        preferred_providers = dict(session.metadata.get("preferred_providers", {}))
        if preferred_providers:
            run.plan.context["preferred_providers"] = preferred_providers
        if "assistant_override" in user_message.metadata:
            run.plan.context["assistant_override"] = user_message.metadata["assistant_override"]
        if "control_action" in user_message.metadata:
            run.plan.context["control_action"] = user_message.metadata["control_action"]
        run.review_mode = review_mode
        run.status = "queued"
        run.updated_at = utcnow()
        self.store.update_run(run)
        self.store.append_event(
            RunEvent(
                session_id=run.session_id,
                run_id=run.id,
                type="review_mode.selected",
                payload={"run_id": run.id, "review_mode": review_mode, "status": run.status},
            )
        )
        return run

    def cancel_run(self, run_id: str, *, reason: str) -> Run:
        run = self.store.get_run(run_id)
        run.status = "cancelled"
        run.error_message = reason
        run.updated_at = utcnow()
        self.store.update_run(run)
        self.store.append_event(
            RunEvent(
                session_id=run.session_id,
                run_id=run.id,
                type="run.cancelled",
                payload={"run_id": run.id, "reason": reason},
            )
        )
        return run

    def latest_run(self, session_id: str, *, statuses: tuple[str, ...] | None = None) -> Run | None:
        return self.store.latest_run_for_session(session_id, statuses=statuses)

    def retry_run(self, run_id: str) -> Run:
        run = self.store.get_run(run_id)
        run.status = "retry_queued"
        run.error_message = None
        run.updated_at = utcnow()
        self.store.update_run(run)
        self.store.append_event(
            RunEvent(session_id=run.session_id, run_id=run.id, type="run.retry_queued", payload={"run_id": run.id})
        )
        return run


class ConversationService:
    def __init__(
        self,
        store: SQLiteStore,
        sessions: SessionService,
        runs: RunService,
        planner: RequestPlanner,
    ) -> None:
        self.store = store
        self.sessions = sessions
        self.runs = runs
        self.planner = planner

    def handle_user_message(self, session_id: str, payload: MessageCreate) -> tuple[ChatMessage, Run]:
        workspace_context = self._build_workspace_context(session_id)
        if workspace_context:
            payload.metadata = {
                **payload.metadata,
                "workspace_context": workspace_context,
            }
        control_payload = self._maybe_apply_control_action(session_id, payload.content)
        if control_payload:
            payload.metadata = {
                **payload.metadata,
                "control_action": control_payload["control_action"],
                "assistant_override": control_payload["assistant_override"],
                "forced_plan": self.planner._chat_only_plan(payload.content).model_dump(mode="json"),
            }
        message = self.sessions.add_user_message(session_id, payload)
        session_messages = self.store.list_messages(session_id)
        pending_run = self.runs.latest_run(session_id, statuses=("awaiting_review_mode",))

        if pending_run is not None and pending_run.source_message_id != message.id:
            resolved_review_mode = self.planner.detect_review_mode_reply(message.content)
            if resolved_review_mode is not None:
                run = self.runs.set_review_mode(
                    pending_run.id,
                    resolved_review_mode,
                    session_messages=session_messages,
                )
                self._add_assistant_message(
                    session_id,
                    f"Review mode set to {resolved_review_mode}. Starting generation.",
                    {"type": "review_mode_selected", "run_id": run.id, "review_mode": resolved_review_mode},
                )
                return message, run

            if self.planner.looks_like_generation_request(message.content):
                self.runs.cancel_run(pending_run.id, reason="superseded_by_new_request")

        run = self.runs.queue_run(session_id, message, session_messages=session_messages)
        if run.status == "awaiting_review_mode":
            self._add_assistant_message(
                session_id,
                "Before I generate anything, choose how outputs should be reviewed: manual, automatic, or hybrid.",
                {"type": "review_mode_request", "run_id": run.id, "options": ["manual", "automatic_vlm", "hybrid"]},
            )
        self._maybe_auto_name_session(session_id)
        return message, run

    def _add_assistant_message(self, session_id: str, content: str, metadata: dict) -> ChatMessage:
        message = ChatMessage(session_id=session_id, role="assistant", content=content, metadata=metadata)
        self.store.add_message(message)
        self.store.append_event(
            RunEvent(session_id=session_id, run_id=metadata.get("run_id"), type="message.created", payload=message.model_dump(mode="json"))
        )
        return message

    def _maybe_apply_control_action(self, session_id: str, prompt: str) -> dict[str, Any] | None:
        session = self.store.get_session(session_id)
        action = _detect_control_action(prompt, self.store.list_providers())
        if action is None:
            return None

        preferred_updates: dict[str, str] = {}
        if action["target"] == "image":
            preferred_updates["image_generation"] = action["provider_id"]
            if action["provider_capabilities"] and "image_editing" in action["provider_capabilities"]:
                preferred_updates["image_editing"] = action["provider_id"]
        elif action["target"] == "3d":
            preferred_updates["object3d_generation"] = action["provider_id"]
        elif action["target"] == "llm":
            preferred_updates["text_chat"] = action["provider_id"]
            if action["provider_capabilities"] and "planner_text" in action["provider_capabilities"]:
                preferred_updates["planner_text"] = action["provider_id"]
            if action["provider_capabilities"] and "vision_review" in action["provider_capabilities"]:
                preferred_updates["vision_review"] = action["provider_id"]

        if preferred_updates:
            session.metadata = _deep_merge_dicts(session.metadata, {"preferred_providers": preferred_updates})
            self.store.update_session(session)

        summary_bits = []
        if action["target"] == "llm":
            summary_bits.append("chat/planner")
        elif action["target"] == "image":
            summary_bits.append("image generation")
            if "image_editing" in action["provider_capabilities"]:
                summary_bits.append("image editing")
        elif action["target"] == "3d":
            summary_bits.append("3D generation")

        summary = ", ".join(summary_bits) if summary_bits else action["target"]
        assistant_override = f"Active {summary} model set to {action['provider_label']}."
        return {
            "control_action": {
                "kind": "switch_provider",
                "target": action["target"],
                "provider_id": action["provider_id"],
                "provider_label": action["provider_label"],
            },
            "assistant_override": assistant_override,
        }

    def _maybe_auto_name_session(self, session_id: str) -> None:
        session = self.store.get_session(session_id)
        if session.metadata.get("auto_named"):
            return
        if not _is_default_session_title(session.title):
            return
        user_messages = [message for message in self.store.list_messages(session_id) if message.role == "user"]
        if len(user_messages) < 3:
            return
        title = _suggest_session_title(user_messages)
        session.title = title
        session.metadata = _deep_merge_dicts(
            session.metadata,
            {"auto_named": True, "message_count_estimate": len(user_messages)},
        )
        self.store.update_session(session)

    def _build_workspace_context(self, session_id: str) -> dict[str, Any] | None:
        session = self.store.get_session(session_id)
        workspace_id = session.metadata.get("workspace_id")
        if not workspace_id:
            return None
        siblings = []
        for candidate in self.store.list_sessions():
            if candidate.id == session_id:
                continue
            if candidate.metadata.get("workspace_id") != workspace_id:
                continue
            if candidate.metadata.get("archived"):
                continue
            last_user_message = next(
                (message.content for message in reversed(self.store.list_messages(candidate.id)) if message.role == "user"),
                None,
            )
            siblings.append(
                {
                    "session_id": candidate.id,
                    "title": candidate.title,
                    "last_user_message": last_user_message,
                }
            )
        if not siblings:
            return None
        return {"workspace_id": workspace_id, "related_sessions": siblings[:6]}


def _deep_merge_dicts(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def _normalize_text(value: str) -> str:
    lowered = value.lower()
    lowered = lowered.replace("ı", "i").replace("ğ", "g").replace("ş", "s").replace("ç", "c").replace("ö", "o").replace("ü", "u")
    return re.sub(r"[^a-z0-9]+", " ", lowered).strip()


def _normalize_model_ref(value: str) -> str:
    normalized = value.strip().removesuffix("/")
    marker = "huggingface.co/"
    if marker in normalized:
        normalized = normalized.split(marker, 1)[1]
    return normalized.lower()


def _detect_control_action(prompt: str, providers: list[Any]) -> dict[str, Any] | None:
    normalized = _normalize_text(prompt)
    control_verb_present = any(
        phrase in normalized
        for phrase in ("use ", "switch ", "change ", "set ", "bundan sonra", "model olarak", "provider olarak", "kullan")
    )
    if not control_verb_present:
        return None

    target = None
    if any(token in normalized for token in ("image model", "flux", "image generator", "imge", "gorsel")):
        target = "image"
        capabilities = ("image_generation", "image_editing")
    elif any(token in normalized for token in ("3d model", "trellis", "hunyuan", "3d generator")):
        target = "3d"
        capabilities = ("object3d_generation",)
    elif any(token in normalized for token in ("llm", "chat model", "planner", "openrouter", "kimi", "gemma", "minimax", "local llm", "yerel llm")):
        target = "llm"
        capabilities = ("text_chat", "planner_text", "vision_review")
    else:
        return None

    requested_source_kind = None
    if "openrouter" in normalized:
        requested_source_kind = "api_openrouter"
    elif "nvidia" in normalized:
        requested_source_kind = "api_generic"
    elif "local" in normalized or "yerel" in normalized:
        requested_source_kind = "local_hf_transformers" if target == "llm" else "local_hf_diffusers"

    query_tokens = {
        token
        for token in normalized.split()
        if token not in {"use", "switch", "change", "set", "bundan", "sonra", "model", "olarak", "provider", "kullan", "the", "a", "an"}
    }

    best_match = None
    best_score = -1
    for provider in providers:
        if not any(capability in provider.capabilities for capability in capabilities):
            continue
        if requested_source_kind and provider.source_kind != requested_source_kind:
            continue
        haystack = _normalize_text(f"{provider.label} {provider.normalized_id} {provider.source_kind}")
        score = sum(1 for token in query_tokens if token and token in haystack)
        if requested_source_kind and provider.source_kind == requested_source_kind:
            score += 2
        if target == "image" and "flux" in haystack and "flux" in query_tokens:
            score += 2
        if target == "llm" and any(name in haystack for name in ("gemma", "kimi", "minimax")):
            score += 1
        if score > best_score:
            best_match = provider
            best_score = score

    if best_match is None or best_score <= 0:
        return None

    return {
        "target": target,
        "provider_id": best_match.id,
        "provider_label": best_match.label,
        "provider_capabilities": list(best_match.capabilities),
    }


def _is_default_session_title(title: str) -> bool:
    normalized = title.strip().lower()
    return normalized.startswith("workspace") or normalized == "forgeflow workspace"


def _suggest_session_title(user_messages: list[ChatMessage]) -> str:
    combined = " ".join(message.content for message in user_messages[-3:])
    normalized = _normalize_text(combined)
    if "osmanli" in normalized or "ottoman" in normalized:
        if "kale" in normalized or "castle" in normalized:
            return "Ottoman Castle Concepts"
        return "Ottoman Concepts"
    if "kale" in normalized or "castle" in normalized:
        return "Castle Concepts"
    if "kalkan" in normalized or "shield" in normalized:
        return "Shield Concepts"
    if "karakter" in normalized or "character" in normalized:
        return "Character Concepts"
    tokens = [token for token in normalized.split() if len(token) > 2][:4]
    if not tokens:
        return "New Workspace Chat"
    return " ".join(token.capitalize() for token in tokens)
