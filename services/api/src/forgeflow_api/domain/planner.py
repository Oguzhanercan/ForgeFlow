from __future__ import annotations

import json
import re
from typing import Any

from forgeflow_api.adapters.base import TextChatAdapter
from forgeflow_api.domain.models import ChatMessage, PipelinePlan


PLANNER_SYSTEM_PROMPT = """
You are a multimodal asset planner.
Return compact JSON only.

Required keys:
- intent_type
- requested_outputs
- grouping_strategy
- system_prompt_profile

Optional keys:
- prompt_jobs

Rules:
- choose one intent_type from: chat_only, single_object_image, single_object_3d, image_plus_3d, asset_pack, mixed_request
- requested_outputs must contain image and/or 3d
- use chat_only for greetings, conversational messages, capabilities questions, or messages that do not ask for asset generation
- if the user asks for a full set, pack, lineup, environment kit, game asset set, or multiple named deliverables, choose asset_pack
- prompt_jobs should be an array only for asset_pack and should contain objects with title, group_key, image_prompt, generate_3d
- when uncertain, prefer image_plus_3d over mixed_request for single tangible objects
""".strip()


class RequestPlanner:
    def __init__(self, text_adapter: TextChatAdapter | None = None) -> None:
        self.text_adapter = text_adapter

    def plan(
        self,
        prompt: str,
        review_mode: str | None = None,
        *,
        allow_llm: bool = True,
        session_messages: list[ChatMessage] | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> PipelinePlan:
        resolved_review_mode = review_mode or self.detect_inline_review_mode(prompt)
        command_plan = self._plan_from_command_mode(
            prompt,
            resolved_review_mode,
            session_messages=session_messages,
            request_metadata=request_metadata,
        )
        if command_plan is not None:
            return command_plan
        if self._is_chat_only_prompt(prompt, session_messages=session_messages):
            return self._chat_only_plan(prompt, resolved_review_mode)
        llm_plan = self._plan_with_llm(prompt, session_messages=session_messages) if allow_llm else None
        if llm_plan is not None:
            llm_plan.review_mode = resolved_review_mode  # type: ignore[assignment]
            llm_plan.needs_user_choice = resolved_review_mode is None and any(
                stage.startswith("review_") for stage in llm_plan.stages
            )
            return llm_plan
        return self._fallback_plan(
            prompt,
            resolved_review_mode,
            session_messages=session_messages,
            request_metadata=request_metadata,
        )

    def _plan_from_command_mode(
        self,
        prompt: str,
        review_mode: str | None,
        *,
        session_messages: list[ChatMessage] | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> PipelinePlan | None:
        command_mode = str((request_metadata or {}).get("command_mode", "")).strip()
        if command_mode == "workflow" and not self.looks_like_generation_request(prompt):
            return None
        intent_by_mode = {
            "workflow": "single_object_image",
            "text_to_image": "single_object_image",
            "image_edit": "single_object_image",
            "image_to_3d": "single_object_3d",
            "upscale": "single_object_image",
        }
        intent_type = intent_by_mode.get(command_mode)
        if intent_type is None:
            return None
        requested_outputs = ["3d"] if intent_type == "single_object_3d" else ["image"]
        effective_prompt = self._merge_prompt_with_context(
            prompt,
            session_messages=session_messages,
            request_metadata=request_metadata,
        )
        return PipelinePlan(
            intent_type=intent_type,
            requested_outputs=requested_outputs,
            review_mode=review_mode,
            stages=self._build_stages(intent_type, requested_outputs),
            grouping_strategy="object_identity",
            needs_user_choice=False,
            system_prompt_profile="single_object" if intent_type == "single_object_3d" else "single_object_image_only",
            planner_notes=f"Command mode forced by UI: {command_mode}.",
            context={
                "prompt_jobs": self._fallback_prompt_jobs(
                    intent_type,
                    effective_prompt,
                    request_metadata=request_metadata,
                )
            },
        )

    def _plan_with_llm(self, prompt: str, *, session_messages: list[ChatMessage] | None = None) -> PipelinePlan | None:
        if self.text_adapter is None:
            return None
        try:
            response = self.text_adapter.generate(
                prompt=self._build_planner_input(prompt, session_messages=session_messages),
                system_prompt=PLANNER_SYSTEM_PROMPT,
            )
            parsed = self._extract_json(response.get("content", ""))
            if parsed is None:
                return None
            return self._normalize_plan(parsed, prompt, planner_notes=f"LLM planner via {response.get('model')}")
        except Exception:
            return None

    def _extract_json(self, content: str) -> dict[str, Any] | None:
        content = content.strip()
        if not content:
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, re.S)
            if not match:
                return None
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None

    def _normalize_plan(
        self,
        payload: dict[str, Any],
        prompt: str,
        *,
        planner_notes: str,
        review_mode: str | None = None,
    ) -> PipelinePlan:
        intent_type = payload.get("intent_type", "mixed_request")
        requested_outputs = list(payload.get("requested_outputs", ["image"]))
        grouping_strategy = payload.get("grouping_strategy", "pipeline_stage")
        profile = payload.get("system_prompt_profile", "mixed_multistage")
        prompt_jobs = payload.get("prompt_jobs") or self._fallback_prompt_jobs(intent_type, prompt)
        stages = self._build_stages(intent_type, requested_outputs)
        return PipelinePlan(
            intent_type=intent_type,
            requested_outputs=requested_outputs,
            review_mode=review_mode,
            stages=stages,
            grouping_strategy=grouping_strategy,
            needs_user_choice=False,
            system_prompt_profile=profile,
            planner_notes=planner_notes,
            context={"prompt_jobs": prompt_jobs},
        )

    def _fallback_plan(
        self,
        prompt: str,
        review_mode: str | None = None,
        *,
        session_messages: list[ChatMessage] | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> PipelinePlan:
        effective_prompt = self._merge_prompt_with_context(
            prompt,
            session_messages=session_messages,
            request_metadata=request_metadata,
        )
        lowered = effective_prompt.lower()
        generation_verbs = (
            "generate", "create", "make", "design", "render", "build", "draw", "paint", "illustrate",
            "üret", "oluştur", "yarat", "tasarla", "çiz", "resmet", "yap"
        )
        image_tokens = (
            "image", "concept", "render", "illustration", "portrait", "photo", "picture",
            "resim", "görsel", "imge", "portre", "illüstrasyon", "konsept", "fotoğraf", "fotograf"
        )
        object_tokens = (
            "object", "obje", "asset", "prop", "character", "weapon", "shield", "sword", "tower", "gate",
            "kalkan", "karakter", "silah", "kapı", "kule", "gemi", "portre"
        )
        has_generation_verb = any(token in lowered for token in generation_verbs)
        has_3d = any(token in lowered for token in ("3d", "glb", "obj", "mesh", "model", "asset", "lowpoly", "low poly"))
        has_pack = any(
            self._contains_phrase(lowered, token)
            for token in (
                "asset pack",
                "asset set",
                "complete set",
                "full set",
                "pack",
                "kit",
                "lineup",
                "collection",
                "set",
                "paket",
            )
        )
        has_image_only = any(token in lowered for token in image_tokens)
        explicit_image_only = any(
            token in lowered
            for token in (
                "image only",
                "only image",
                "just image",
                "image-only",
                "sadece image",
                "sadece imge",
                "sadece resim",
                "sadece görsel",
                "sadece fotoğraf",
                "sadece fotograf",
                "yalnızca imge",
                "just a render",
                "only render",
            )
        )
        has_generation_subject = any(token in lowered for token in object_tokens) and has_generation_verb
        selected_asset_id = str(request_metadata.get("selected_asset_id", "")).strip() if request_metadata else ""
        selected_asset_kind = str(request_metadata.get("selected_asset_kind", "")).strip() if request_metadata else ""
        selected_asset_title = str(request_metadata.get("selected_asset_title", "")).strip() if request_metadata else ""
        selected_asset_group_key = str(request_metadata.get("selected_asset_group_key", "")).strip() if request_metadata else ""
        edit_tokens = (
            "edit", "modify", "variation", "variant of this", "change", "refine", "retouch", "cleanup",
            "restore", "remove background", "replace background", "rework", "adjust", "iterate on this",
            "düzenle", "editle", "degistir", "değiştir", "revize", "varyasyon", "bu görseli", "bu resmi",
        )
        is_selected_image_edit = (
            bool(selected_asset_id)
            and selected_asset_kind in {"raw_image", "prepared_image"}
            and any(token in lowered for token in edit_tokens)
        )
        is_selected_image_to_3d = (
            bool(selected_asset_id)
            and selected_asset_kind in {"raw_image", "prepared_image"}
            and has_3d
            and not is_selected_image_edit
        )

        if is_selected_image_edit:
            intent_type = "image_plus_3d" if has_3d else "single_object_image"
            grouping_strategy = "object_identity"
            requested_outputs = ["image", "3d"] if has_3d else ["image"]
            profile = "image_edit_to_3d" if has_3d else "image_edit_only"
        elif is_selected_image_to_3d:
            intent_type = "single_object_3d"
            grouping_strategy = "object_identity"
            requested_outputs = ["3d"]
            profile = "single_object"
        elif has_pack:
            intent_type = "asset_pack"
            grouping_strategy = "asset_family"
            requested_outputs = ["image", "3d"] if has_3d or "export" in lowered else ["image"]
            profile = "asset_pack"
        elif explicit_image_only:
            intent_type = "single_object_image"
            grouping_strategy = "object_identity"
            requested_outputs = ["image"]
            profile = "single_object_image_only"
        elif has_3d and has_image_only:
            intent_type = "image_plus_3d"
            grouping_strategy = "object_identity"
            requested_outputs = ["image", "3d"]
            profile = "single_object_image_to_3d"
        elif has_3d:
            intent_type = "single_object_3d"
            grouping_strategy = "object_identity"
            requested_outputs = ["3d"]
            profile = "single_object"
        elif has_image_only:
            intent_type = "single_object_image"
            grouping_strategy = "object_identity"
            requested_outputs = ["image"]
            profile = "single_object_image_only"
        elif has_generation_subject:
            intent_type = "image_plus_3d"
            grouping_strategy = "object_identity"
            requested_outputs = ["image", "3d"]
            profile = "single_object_image_to_3d"
        elif has_generation_verb and has_image_only:
            intent_type = "single_object_image"
            grouping_strategy = "object_identity"
            requested_outputs = ["image"]
            profile = "single_object_image_only"
        else:
            return self._chat_only_plan(prompt, review_mode)

        stages = self._build_stages(intent_type, requested_outputs)
        needs_user_choice = review_mode is None and any(stage.startswith("review_") for stage in stages)
        return PipelinePlan(
            intent_type=intent_type,
            requested_outputs=requested_outputs,
            review_mode=review_mode,
            stages=stages,
            grouping_strategy=grouping_strategy,
            needs_user_choice=needs_user_choice,
            system_prompt_profile=profile,
            planner_notes="Rule-based planner fallback active.",
            context={
                "prompt_jobs": self._fallback_prompt_jobs(
                    intent_type,
                    effective_prompt,
                    request_metadata=request_metadata,
                )
            },
        )

    def _build_stages(self, intent_type: str, requested_outputs: list[str]) -> list[str]:
        if intent_type == "chat_only":
            return ["respond_text", "finalize_reply"]
        if intent_type == "asset_pack":
            stages = ["plan", "generate_images", "prepare_images", "review_images"]
            if "3d" in requested_outputs:
                stages.extend(["generate_3d", "review_3d"])
            stages.extend(["group_catalog", "finalize_reply"])
            return stages
        if intent_type == "image_plus_3d":
            return [
                "plan",
                "generate_images",
                "prepare_images",
                "review_images",
                "generate_3d",
                "review_3d",
                "finalize_reply",
            ]
        if intent_type == "single_object_3d":
            return ["plan", "generate_images", "prepare_images", "generate_3d", "review_3d", "finalize_reply"]
        if intent_type == "single_object_image":
            return ["plan", "generate_images", "review_images", "finalize_reply"]
        return ["plan", "generate_images", "review_images", "finalize_reply"]

    def _fallback_prompt_jobs(
        self,
        intent_type: str,
        prompt: str,
        *,
        request_metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if intent_type == "chat_only":
            return []
        if intent_type != "asset_pack":
            selected_asset_id = str(request_metadata.get("selected_asset_id", "")).strip() if request_metadata else ""
            selected_asset_kind = str(request_metadata.get("selected_asset_kind", "")).strip() if request_metadata else ""
            selected_asset_title = str(request_metadata.get("selected_asset_title", "")).strip() if request_metadata else ""
            selected_asset_group_key = str(request_metadata.get("selected_asset_group_key", "")).strip() if request_metadata else ""
            return [
                {
                    "title": selected_asset_title or "primary",
                    "group_key": selected_asset_group_key or "primary",
                    "image_prompt": prompt,
                    "generate_3d": "3d" in prompt.lower() or intent_type in {"image_plus_3d", "single_object_3d"},
                    **({"source_asset_id": selected_asset_id} if selected_asset_id else {}),
                    **({"source_asset_kind": selected_asset_kind} if selected_asset_kind else {}),
                }
            ]
        core = prompt.strip().rstrip(".")
        families = [
            ("hero_prop", "hero prop concept"),
            ("structure_module", "modular architectural piece"),
            ("banner_crest", "banner and crest sheet"),
            ("character", "full-body character concept"),
            ("support_prop", "support prop and utility item"),
            ("formation_board", "orthographic formation board"),
        ]
        jobs: list[dict[str, Any]] = []
        for group_key, suffix in families:
            for variant in range(2):
                jobs.append(
                    {
                        "title": f"{group_key}_v{variant + 1}",
                        "group_key": group_key,
                        "image_prompt": f"{core}. Create a {suffix}. Variant {variant + 1}. Plain or transparent background. No UI.",
                        "generate_3d": group_key != "formation_board",
                    }
                )
        return jobs

    def _chat_only_plan(self, prompt: str, review_mode: str | None = None) -> PipelinePlan:
        return PipelinePlan(
            intent_type="chat_only",
            requested_outputs=[],
            review_mode=review_mode,
            stages=self._build_stages("chat_only", []),
            grouping_strategy="conversation",
            needs_user_choice=False,
            system_prompt_profile="chat_only",
            planner_notes="Greeting/conversation short-circuit.",
            context={"chat_prompt": prompt},
        )

    def _contains_phrase(self, lowered: str, token: str) -> bool:
        normalized = token.strip().lower()
        if " " in normalized:
            return normalized in lowered
        return re.search(rf"\b{re.escape(normalized)}\b", lowered) is not None

    def _is_chat_only_prompt(self, prompt: str, *, session_messages: list[ChatMessage] | None = None) -> bool:
        stripped = prompt.strip()
        lowered = stripped.lower()
        if not stripped:
            return True

        control_markers = (
            "use ",
            "switch ",
            "change ",
            "set ",
            "bundan sonra",
            "şundan sonra",
            "model olarak",
            "provider olarak",
            "openrouter",
            "nvidia",
            "local llm",
            "yerel llm",
            "local model",
        )
        if any(marker in lowered for marker in control_markers) and any(
            token in lowered
            for token in (
                "model",
                "llm",
                "planner",
                "chat",
                "provider",
                "flux",
                "gemma",
                "kimi",
                "minimax",
                "trellis",
            )
        ):
            return True

        exact_greetings = {
            "hey",
            "hi",
            "hello",
            "yo",
            "sup",
            "selam",
            "merhaba",
            "günaydın",
            "iyi akşamlar",
            "naber",
            "napıyorsun",
        }
        if lowered in exact_greetings:
            return True

        generation_tokens = (
            "generate",
            "create",
            "make",
            "design",
            "render",
            "image",
            "concept",
            "illustration",
            "asset",
            "imge",
            "fotoğraf",
            "fotograf",
            "3d",
            "glb",
            "obj",
            "mesh",
            "texture",
            "model",
            "pack",
            "kit",
            "environment",
            "character",
            "prop",
            "tower",
            "gate",
            "shield",
            "sword",
            "üret",
            "oluştur",
            "yarat",
            "tasarla",
            "çiz",
            "resim",
            "görsel",
            "portre",
            "obje",
            "kalkan",
        )
        if any(token in lowered for token in generation_tokens):
            return False

        conversational_patterns = (
            "how are you",
            "what can you do",
            "who are you",
            "help me",
            "can you help",
            "thanks",
            "thank you",
            "adın ne",
            "kimsin",
            "nasılsın",
            "ne yapıyorsun",
            "yardım eder misin",
        )
        if any(pattern in lowered for pattern in conversational_patterns):
            return True

        word_count = len(re.findall(r"\w+", lowered))
        if session_messages and self._extract_last_generation_request(session_messages, exclude_prompt=prompt):
            follow_up_tokens = ("it", "that", "this", "same", "also", "too", "again", "version", "variant")
            if any(token in lowered for token in follow_up_tokens):
                return False
        return word_count <= 6 and ("?" in stripped or word_count <= 2)

    def detect_inline_review_mode(self, prompt: str) -> str | None:
        lowered = prompt.lower()
        if "hybrid review" in lowered or re.search(r"\bhybrid\b", lowered):
            return "hybrid"
        if "automatic review" in lowered or "auto review" in lowered or "automatic_vlm" in lowered:
            return "automatic_vlm"
        if re.search(r"\bmanual\b", lowered):
            return "manual"
        return None

    def detect_review_mode_reply(self, prompt: str) -> str | None:
        lowered = prompt.strip().lower()
        if lowered in {"manual", "manual review"}:
            return "manual"
        if lowered in {
            "automatic",
            "auto",
            "auto review",
            "automatic review",
            "automatic_vlm",
            "automatic-vlm",
            "auto_vlm",
            "auto-vlm",
            "default",
        }:
            return "automatic_vlm"
        if lowered in {"hybrid", "hybrid review"}:
            return "hybrid"
        if lowered in {"go", "continue", "ok", "okay", "sure", "yes", "yep", "no"}:
            return "automatic_vlm"
        return None

    def looks_like_generation_request(self, prompt: str) -> bool:
        lowered = prompt.lower()
        return any(
            token in lowered
            for token in (
                "generate",
                "create",
                "make",
                "design",
                "render",
                "build",
                "draw",
                "illustrate",
                "üret",
                "oluştur",
                "yarat",
                "tasarla",
                "çiz",
                "resmet",
            )
        )

    def _build_planner_input(self, prompt: str, *, session_messages: list[ChatMessage] | None = None) -> str:
        if not session_messages:
            return prompt
        transcript = "\n".join(
            f"{message.role}: {message.content}"
            for message in session_messages[-8:]
        )
        return (
            "Conversation context:\n"
            f"{transcript}\n\n"
            "Plan the correct next action for the latest user message. "
            "If the user refers to an earlier object or request, use the conversation context.\n\n"
            f"Latest user message:\n{prompt}"
        )

    def _merge_prompt_with_context(
        self,
        prompt: str,
        *,
        session_messages: list[ChatMessage] | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> str:
        workspace_suffix = ""
        workspace_context = request_metadata.get("workspace_context") if request_metadata else None
        if isinstance(workspace_context, dict):
            related_sessions = workspace_context.get("related_sessions") or []
            snippets: list[str] = []
            for item in related_sessions[:4]:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title", "")).strip()
                last_message = str(item.get("last_user_message", "")).strip()
                if title or last_message:
                    snippets.append(f"{title}: {last_message}".strip(": "))
            if snippets:
                workspace_suffix = " Workspace context: " + " | ".join(snippets)
        if not session_messages:
            return f"{prompt}{workspace_suffix}".strip()
        last_generation_request = self._extract_last_generation_request(session_messages, exclude_prompt=prompt)
        if last_generation_request is None:
            return f"{prompt}{workspace_suffix}".strip()
        lowered = prompt.lower()
        follow_up_tokens = ("it", "that", "this", "same", "also", "too", "again", "variant", "version")
        if any(token in lowered for token in follow_up_tokens) or len(re.findall(r"\w+", lowered)) <= 5:
            return f"{last_generation_request}. Follow-up instruction: {prompt}{workspace_suffix}".strip()
        return f"{prompt}{workspace_suffix}".strip()

    def _extract_last_generation_request(
        self,
        session_messages: list[ChatMessage],
        *,
        exclude_prompt: str | None = None,
    ) -> str | None:
        excluded = exclude_prompt.strip().lower() if exclude_prompt else None
        for message in reversed(session_messages):
            if message.role != "user":
                continue
            lowered = message.content.strip().lower()
            if excluded and lowered == excluded:
                continue
            if self.looks_like_generation_request(message.content):
                return message.content
        return None
