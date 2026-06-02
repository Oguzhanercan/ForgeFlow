from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
from typing import Any
from uuid import uuid4

from PIL import Image

from forgeflow_api.core.adapter_manager import AdapterManager
from forgeflow_api.core.artifacts import ArtifactStore
from forgeflow_api.core.image_prep import ensure_transparent_rgba, validate_rgba_png
from forgeflow_api.core.store import SQLiteStore
from forgeflow_api.domain.models import Artifact, ChatMessage, PipelinePlan, ProviderModel, Run, RunEvent, utcnow
from forgeflow_api.domain.providers import ProviderRegistry
from forgeflow_api.domain.review import ReviewPolicyEngine


@dataclass
class StageResult:
    stage: str
    status: str
    detail: dict[str, Any]


class PipelineEngine:
    def __init__(
        self,
        artifact_store: ArtifactStore,
        store: SQLiteStore,
        provider_registry: ProviderRegistry,
        adapter_manager: AdapterManager,
        review_engine: ReviewPolicyEngine,
    ) -> None:
        self.artifact_store = artifact_store
        self.store = store
        self.provider_registry = provider_registry
        self.adapter_manager = adapter_manager
        self.review_engine = review_engine

    def build_stage_sequence(self, plan: PipelinePlan, providers: list[ProviderModel]) -> list[StageResult]:
        provider_caps = {cap for provider in providers for cap in provider.capabilities}
        results: list[StageResult] = []
        for stage in plan.stages:
            if stage == "generate_images" and "image_generation" not in provider_caps:
                results.append(StageResult(stage=stage, status="blocked", detail={"reason": "missing_image_provider"}))
            elif stage == "generate_3d" and "object3d_generation" not in provider_caps:
                results.append(StageResult(stage=stage, status="blocked", detail={"reason": "missing_3d_provider"}))
            elif stage.startswith("review_") and plan.review_mode in {"automatic_vlm", "hybrid"} and "vision_review" not in provider_caps:
                results.append(StageResult(stage=stage, status="blocked", detail={"reason": "missing_vlm_provider"}))
            else:
                results.append(StageResult(stage=stage, status="ready", detail={}))
        return results

    def execute_run(self, run: Run, user_message: ChatMessage) -> Run:
        self._emit_event(run.session_id, run.id, "run.started", {"run_id": run.id, "intent_type": run.intent_type})
        if run.plan.intent_type != "chat_only":
            self._add_assistant_message(
                run.session_id,
                f"Pipeline ready: {', '.join(run.plan.stages)}",
                {"type": "pipeline_plan", "plan": run.plan.model_dump(mode="json")},
            )

        executable_stages = [stage for stage in run.plan.stages if stage != "finalize_reply"]
        for stage_index, stage in enumerate(executable_stages, start=1):
            if stage == "finalize_reply":
                continue
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.started",
                stage=stage,
                stage_index=stage_index,
                stage_count=len(executable_stages),
                progress_pct=max(4, int(((stage_index - 1) / max(len(executable_stages), 1)) * 100)),
            )
            detail = self._execute_stage(run, stage, user_message)
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.completed",
                stage=stage,
                stage_index=stage_index,
                stage_count=len(executable_stages),
                progress_pct=int((stage_index / max(len(executable_stages), 1)) * 100),
                detail=detail,
            )

        if run.plan.intent_type != "chat_only" and not any(
            artifact.kind == "catalog" for artifact in self.store.list_artifacts_for_run(run.id)
        ):
            self._group_catalog(run)

        artifacts = self.store.list_artifacts_for_run(run.id)
        summary = None if run.plan.intent_type == "chat_only" else self._build_summary(run, artifacts)
        if summary is not None:
            self._stream_assistant_message(run.session_id, summary, {"type": "assistant", "run_id": run.id})
        self._emit_event(run.session_id, run.id, "run.completed", {"run_id": run.id, "summary": summary})
        run.status = "completed"
        run.updated_at = utcnow()
        self.store.update_run(run)
        return run

    def write_pack_catalog(self, run_id: str, artifacts: list[dict[str, Any]]) -> Path:
        return self.artifact_store.write_catalog(run_id, artifacts)

    def _execute_stage(self, run: Run, stage: str, user_message: ChatMessage) -> dict[str, Any]:
        if stage == "plan":
            return {
                "stage_sequence": run.plan.stages,
                "grouping_strategy": run.plan.grouping_strategy,
            }
        if stage == "respond_text":
            return self._respond_text(run, user_message)
        if stage == "generate_images":
            return self._generate_images(run, user_message)
        if stage == "prepare_images":
            return self._prepare_images(run)
        if stage == "review_images":
            return self._review_images(run)
        if stage == "generate_3d":
            return self._generate_3d(run)
        if stage == "review_3d":
            return self._review_3d(run)
        if stage == "group_catalog":
            return self._group_catalog(run)
        return {"status": "skipped"}

    def _respond_text(self, run: Run, user_message: ChatMessage) -> dict[str, Any]:
        preferred_providers = run.plan.context.get("preferred_providers", {})
        override = str(run.plan.context.get("assistant_override", "")).strip()
        provider = None
        adapter = None
        system_prompt = (
            "You are ForgeFlow, a chat-first creative production assistant. "
            "Behave like a normal chatbot during conversation. "
            "Only discuss asset generation when the user is actually asking for it. "
            "Reply briefly, naturally, and in the user's language."
        )
        self._emit_event(
            run.session_id,
            run.id,
            "message.thinking",
            {"run_id": run.id, "status": "started", "label": "Thinking"},
        )
        if override:
            result = {"status": "ok"}
            content = override
        else:
            provider = self._select_provider("text_chat", preferred_provider_id=preferred_providers.get("text_chat"))
            adapter = self.adapter_manager.get(provider, "text_chat")
            try:
                result = adapter.generate(user_message.content, system_prompt=system_prompt)
                content = (result.get("content") or "").strip()
            except Exception:
                result = {"status": "degraded", "provider": provider.label, "model": provider.normalized_id}
                content = ""
        self._emit_event(
            run.session_id,
            run.id,
            "message.thinking",
            {"run_id": run.id, "status": "completed", "label": "Thinking"},
        )
        if not content:
            content = "Buradayim. Ne uretmemi istedigini yaz: tek obje, sadece imge, imgeden 3D, ya da toplu asset set."
        self._stream_assistant_message(
            run.session_id,
            content,
            {
                "type": "assistant",
                "run_id": run.id,
                "provider_id": provider.id if provider else None,
                "provider_label": provider.label if provider else "ForgeFlow",
            },
        )
        return {
            "provider_id": provider.id if provider else None,
            "provider_label": provider.label if provider else "ForgeFlow",
            "status": result.get("status", "ok"),
        }

    def _generate_images(self, run: Run, user_message: ChatMessage) -> dict[str, Any]:
        jobs = run.plan.context.get("prompt_jobs") or [
            {
                "title": "primary",
                "group_key": "primary",
                "image_prompt": user_message.content,
                "generate_3d": "3d" in run.plan.requested_outputs,
            }
        ]
        created_ids: list[str] = []
        preferred_providers = run.plan.context.get("preferred_providers", {})
        for index, job in enumerate(jobs):
            source_asset_id = job.get("source_asset_id")
            if run.plan.intent_type == "single_object_3d" and source_asset_id:
                reused = self._reuse_source_image_for_3d(run, job, index, str(source_asset_id))
                self.store.add_artifact(reused)
                created_ids.append(reused.id)
                self._emit_stage_update(
                    run.session_id,
                    run.id,
                    "stage.progress",
                    stage="generate_images",
                    stage_index=run.plan.stages.index("generate_images") + 1 if "generate_images" in run.plan.stages else 1,
                    stage_count=len([stage for stage in run.plan.stages if stage != "finalize_reply"]),
                    completed_items=len(created_ids),
                    total_items=len(jobs),
                    progress_pct=self._stage_progress_pct(
                        run.plan,
                        "generate_images",
                        completed_items=len(created_ids),
                        total_items=len(jobs),
                    ),
                    label="Reusing source images",
                )
                continue
            capability = "image_editing" if job.get("source_asset_id") else "image_generation"
            preferred_provider_id = preferred_providers.get(capability) or (
                preferred_providers.get("image_generation") if capability == "image_editing" else None
            )
            provider = self._select_provider(capability, preferred_provider_id=preferred_provider_id)
            adapter = self.adapter_manager.get(provider, capability)
            filename = f"{job['group_key']}_{index:03d}.png"
            output_path = self.artifact_store.build_path(run.id, "images_raw", filename)
            source_image_paths: list[str] = []
            if source_asset_id:
                source_artifact = self.store.get_artifact(str(source_asset_id))
                source_image_paths = [source_artifact.path]
            result = adapter.generate(
                job["image_prompt"],
                output_path,
                **({"source_image_paths": source_image_paths} if source_image_paths else {}),
            )
            artifact = Artifact(
                run_id=run.id,
                session_id=run.session_id,
                stage="generate_images",
                kind="raw_image",
                status=result.get("status", "generated"),
                title=job["title"],
                group_key=job["group_key"],
                path=str(output_path),
                mime_type="image/png",
                metadata={
                    "prompt": job["image_prompt"],
                    "provider_id": provider.id,
                    "provider_label": provider.label,
                    "generate_3d": job.get("generate_3d", False),
                    "edit_source_artifact_id": source_asset_id,
                },
            )
            self.store.add_artifact(artifact)
            created_ids.append(artifact.id)
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.progress",
                stage="generate_images",
                stage_index=run.plan.stages.index("generate_images") + 1 if "generate_images" in run.plan.stages else 1,
                stage_count=len([stage for stage in run.plan.stages if stage != "finalize_reply"]),
                completed_items=len(created_ids),
                total_items=len(jobs),
                progress_pct=self._stage_progress_pct(
                    run.plan,
                    "generate_images",
                    completed_items=len(created_ids),
                    total_items=len(jobs),
                ),
                label="Generating images",
            )
        return {"artifact_ids": created_ids, "count": len(created_ids)}

    def _reuse_source_image_for_3d(self, run: Run, job: dict[str, Any], index: int, source_asset_id: str) -> Artifact:
        source_artifact = self.store.get_artifact(source_asset_id)
        suffix = Path(source_artifact.path).suffix or ".png"
        filename = f"{job['group_key']}_{index:03d}{suffix}"
        output_path = self.artifact_store.build_path(run.id, "images_raw", filename)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_artifact.path, output_path)
        return Artifact(
            run_id=run.id,
            session_id=run.session_id,
            stage="generate_images",
            kind="raw_image",
            status="reused",
            title=job["title"],
            group_key=job["group_key"],
            path=str(output_path),
            mime_type=source_artifact.mime_type or "image/png",
            metadata={
                "prompt": job["image_prompt"],
                "provider_id": None,
                "provider_label": "source-artifact",
                "generate_3d": job.get("generate_3d", True),
                "edit_source_artifact_id": source_asset_id,
                "reused_source_artifact_id": source_asset_id,
            },
        )

    def _prepare_images(self, run: Run) -> dict[str, Any]:
        raw_images = [artifact for artifact in self.store.list_artifacts_for_run(run.id) if artifact.kind == "raw_image"]
        created_ids: list[str] = []
        for artifact in raw_images:
            image = Image.open(artifact.path)
            prepared = ensure_transparent_rgba(image)
            prepared_name = f"{Path(artifact.path).stem}.prepared.png"
            prepared_path = self.artifact_store.build_path(run.id, "images_prepared", prepared_name)
            prepared.save(prepared_path)
            ok, reason = validate_rgba_png(prepared)
            prepared_artifact = Artifact(
                run_id=run.id,
                session_id=run.session_id,
                stage="prepare_images",
                kind="prepared_image",
                status="prepared" if ok else "prepared_with_warning",
                title=artifact.title,
                group_key=artifact.group_key,
                path=str(prepared_path),
                mime_type="image/png",
                metadata={
                    "source_artifact_id": artifact.id,
                    "validation": reason,
                    "generate_3d": artifact.metadata.get("generate_3d", False),
                },
            )
            self.store.add_artifact(prepared_artifact)
            created_ids.append(prepared_artifact.id)
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.progress",
                stage="prepare_images",
                stage_index=run.plan.stages.index("prepare_images") + 1 if "prepare_images" in run.plan.stages else 1,
                stage_count=len([stage for stage in run.plan.stages if stage != "finalize_reply"]),
                completed_items=len(created_ids),
                total_items=len(raw_images),
                progress_pct=self._stage_progress_pct(
                    run.plan,
                    "prepare_images",
                    completed_items=len(created_ids),
                    total_items=len(raw_images),
                ),
                label="Preparing transparent PNGs",
            )
        return {"artifact_ids": created_ids, "count": len(created_ids)}

    def _review_images(self, run: Run) -> dict[str, Any]:
        images = [
            artifact
            for artifact in self.store.list_artifacts_for_run(run.id)
            if artifact.kind in {"prepared_image", "raw_image"}
        ]
        if run.review_mode == "manual":
            self._emit_event(
                run.session_id,
                run.id,
                "review.manual_required",
                {"run_id": run.id, "artifact_ids": [artifact.id for artifact in images]},
            )
            return {"mode": "manual", "count": len(images)}
        review = self.review_engine.resolve(run.review_mode, "review_images")
        review_provider = None
        adapter = None
        preferred_providers = run.plan.context.get("preferred_providers", {})
        if review.reviewer_type == "vision_review":
            try:
                review_provider = self._select_provider(
                    "vision_review",
                    preferred_provider_id=preferred_providers.get("vision_review"),
                )
                candidate = self.adapter_manager.get(review_provider, "vision_review")
                if candidate.healthcheck().ok:
                    adapter = candidate
            except KeyError:
                adapter = None
        created_ids: list[str] = []
        for artifact in images:
            review_result = {
                "status": "degraded",
                "result": {"pass": True, "confidence": 0.5, "short_critique": "review adapter unavailable"},
            }
            if adapter is not None:
                try:
                    review_result = adapter.review(
                        [Path(artifact.path)],
                        "Review the output for prompt adherence, silhouette clarity, artifact detection, and approval readiness. Return structured JSON.",
                    )
                except Exception as exc:
                    review_result = {
                        "status": "error",
                        "result": {"pass": False, "confidence": 0.1, "short_critique": str(exc)},
                    }
            review_path = self.artifact_store.write_json(
                run.id,
                "reviews",
                f"{artifact.id}.image_review.json",
                review_result,
            )
            review_artifact = Artifact(
                run_id=run.id,
                session_id=run.session_id,
                stage="review_images",
                kind="image_review",
                status=review_result.get("status", "reviewed"),
                title=f"{artifact.title} review",
                group_key=artifact.group_key,
                path=str(review_path),
                mime_type="application/json",
                metadata={
                    "source_artifact_id": artifact.id,
                    "provider_id": review_provider.id if review_provider else None,
                    "review_mode": run.review_mode,
                    "review": review_result.get("result", review_result),
                },
            )
            self.store.add_artifact(review_artifact)
            created_ids.append(review_artifact.id)
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.progress",
                stage="review_images",
                stage_index=run.plan.stages.index("review_images") + 1 if "review_images" in run.plan.stages else 1,
                stage_count=len([stage for stage in run.plan.stages if stage != "finalize_reply"]),
                completed_items=len(created_ids),
                total_items=len(images),
                progress_pct=self._stage_progress_pct(
                    run.plan,
                    "review_images",
                    completed_items=len(created_ids),
                    total_items=len(images),
                ),
                label="Reviewing images",
            )
        return {"mode": run.review_mode, "artifact_ids": created_ids}

    def _generate_3d(self, run: Run) -> dict[str, Any]:
        preferred_providers = run.plan.context.get("preferred_providers", {})
        provider = self._select_provider(
            "object3d_generation",
            preferred_provider_id=preferred_providers.get("object3d_generation"),
        )
        adapter = self.adapter_manager.get(provider, "object3d_generation")
        source_images = [
            artifact
            for artifact in self.store.list_artifacts_for_run(run.id)
            if artifact.kind == "prepared_image" and artifact.metadata.get("generate_3d", True)
        ]
        if not source_images:
            source_images = [
                artifact
                for artifact in self.store.list_artifacts_for_run(run.id)
                if artifact.kind == "raw_image" and artifact.metadata.get("generate_3d", True)
            ]
        created_ids: list[str] = []
        for artifact in source_images:
            safe_name = artifact.title.replace(" ", "_").replace("/", "_")
            output_dir = self.artifact_store.stage_dir(run.id, "assets_3d") / artifact.group_key
            result = adapter.generate(Path(artifact.path), output_dir, safe_name)
            asset_path = result.get("asset_path") or result.get("path")
            object_artifact = Artifact(
                run_id=run.id,
                session_id=run.session_id,
                stage="generate_3d",
                kind="object3d",
                status=result.get("status", "generated"),
                title=artifact.title,
                group_key=artifact.group_key,
                path=str(asset_path),
                mime_type="model/gltf-binary",
                metadata={
                    "source_artifact_id": artifact.id,
                    "provider_id": provider.id,
                    "initial_glb": result.get("initial_glb"),
                },
            )
            self.store.add_artifact(object_artifact)
            created_ids.append(object_artifact.id)
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.progress",
                stage="generate_3d",
                stage_index=run.plan.stages.index("generate_3d") + 1 if "generate_3d" in run.plan.stages else 1,
                stage_count=len([stage for stage in run.plan.stages if stage != "finalize_reply"]),
                completed_items=len(created_ids),
                total_items=len(source_images),
                progress_pct=self._stage_progress_pct(
                    run.plan,
                    "generate_3d",
                    completed_items=len(created_ids),
                    total_items=len(source_images),
                ),
                label="Generating 3D assets",
            )
        return {"artifact_ids": created_ids, "count": len(created_ids)}

    def _review_3d(self, run: Run) -> dict[str, Any]:
        objects = [artifact for artifact in self.store.list_artifacts_for_run(run.id) if artifact.kind == "object3d"]
        created_ids: list[str] = []
        for artifact in objects:
            path = Path(artifact.path)
            payload = {
                "status": "reviewed",
                "exists": path.exists(),
                "size_bytes": path.stat().st_size if path.exists() else 0,
                "extension": path.suffix,
            }
            review_path = self.artifact_store.write_json(
                run.id,
                "reviews",
                f"{artifact.id}.object3d_review.json",
                payload,
            )
            review_artifact = Artifact(
                run_id=run.id,
                session_id=run.session_id,
                stage="review_3d",
                kind="object3d_review",
                status="reviewed",
                title=f"{artifact.title} geometry review",
                group_key=artifact.group_key,
                path=str(review_path),
                mime_type="application/json",
                metadata={"source_artifact_id": artifact.id, "review": payload},
            )
            self.store.add_artifact(review_artifact)
            created_ids.append(review_artifact.id)
            self._emit_stage_update(
                run.session_id,
                run.id,
                "stage.progress",
                stage="review_3d",
                stage_index=run.plan.stages.index("review_3d") + 1 if "review_3d" in run.plan.stages else 1,
                stage_count=len([stage for stage in run.plan.stages if stage != "finalize_reply"]),
                completed_items=len(created_ids),
                total_items=len(objects),
                progress_pct=self._stage_progress_pct(
                    run.plan,
                    "review_3d",
                    completed_items=len(created_ids),
                    total_items=len(objects),
                ),
                label="Reviewing geometry",
            )
        return {"artifact_ids": created_ids, "count": len(created_ids)}

    def _group_catalog(self, run: Run) -> dict[str, Any]:
        artifacts = self.store.list_artifacts_for_run(run.id)
        entries = [
            {
                "artifact_id": artifact.id,
                "kind": artifact.kind,
                "title": artifact.title,
                "group": artifact.group_key,
                "path": artifact.path,
                "status": artifact.status,
                "metadata": artifact.metadata,
            }
            for artifact in artifacts
            if artifact.kind in {"raw_image", "prepared_image", "object3d"}
        ]
        path = self.write_pack_catalog(run.id, entries)
        catalog_artifact = Artifact(
            run_id=run.id,
            session_id=run.session_id,
            stage="group_catalog",
            kind="catalog",
            status="generated",
            title="master catalog",
            group_key="catalog",
            path=str(path),
            mime_type="application/json",
            metadata={"entry_count": len(entries)},
        )
        self.store.add_artifact(catalog_artifact)
        return {"path": str(path), "entry_count": len(entries)}

    def _select_provider(self, capability: str, *, preferred_provider_id: str | None = None) -> ProviderModel:
        candidates = [
            provider
            for provider in self.provider_registry.find_by_capability(capability)
            if self.adapter_manager.has(provider, capability)
        ]
        if not candidates:
            raise KeyError(f"missing provider for {capability}")
        if preferred_provider_id:
            for provider in candidates:
                if provider.id == preferred_provider_id:
                    return provider
        if capability in {"planner_text", "text_chat", "vision_review"}:
            for provider in candidates:
                if provider.normalized_id == "moonshotai/kimi-k2.5":
                    return provider
        preferred_orders = {
            "planner_text": ["api_generic", "local_hf_transformers", "api_openrouter"],
            "text_chat": ["api_generic", "api_openrouter", "local_hf_transformers"],
            "vision_review": ["api_generic", "local_hf_transformers"],
            "image_generation": ["api_generic", "local_hf_diffusers"],
            "image_editing": ["local_hf_diffusers", "api_generic"],
            "object3d_generation": ["local_custom", "api_generic"],
        }
        order = preferred_orders.get(capability, [])
        for source_kind in order:
            for provider in candidates:
                if provider.source_kind == source_kind:
                    return provider
        return candidates[0]

    def _emit_event(self, session_id: str, run_id: str | None, event_type: str, payload: dict[str, Any]) -> None:
        self.store.append_event(RunEvent(session_id=session_id, run_id=run_id, type=event_type, payload=payload))

    def _add_assistant_message(self, session_id: str, content: str, metadata: dict[str, Any]) -> None:
        message = ChatMessage(session_id=session_id, role="assistant", content=content, metadata=metadata)
        self.store.add_message(message)
        self._emit_event(session_id, metadata.get("run_id"), "message.created", message.model_dump(mode="json"))

    def _stream_assistant_message(self, session_id: str, content: str, metadata: dict[str, Any]) -> None:
        stream_id = f"stream_{uuid4().hex}"
        run_id = metadata.get("run_id")
        stream_metadata = {**metadata, "stream_id": stream_id}
        self._emit_event(session_id, run_id, "message.stream.started", {"run_id": run_id, "stream_id": stream_id})
        for chunk in self._chunk_text(content):
            self._emit_event(
                session_id,
                run_id,
                "message.stream.delta",
                {"run_id": run_id, "stream_id": stream_id, "chunk": chunk},
            )
        self._emit_event(session_id, run_id, "message.stream.completed", {"run_id": run_id, "stream_id": stream_id})
        self._add_assistant_message(session_id, content, stream_metadata)

    def _emit_stage_update(
        self,
        session_id: str,
        run_id: str,
        event_type: str,
        *,
        stage: str,
        stage_index: int,
        stage_count: int,
        progress_pct: int,
        detail: dict[str, Any] | None = None,
        completed_items: int | None = None,
        total_items: int | None = None,
        label: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "run_id": run_id,
            "stage": stage,
            "stage_index": stage_index,
            "stage_count": stage_count,
            "progress_pct": progress_pct,
            "label": label or stage.replace("_", " "),
        }
        if detail is not None:
            payload["detail"] = detail
        if completed_items is not None:
            payload["completed_items"] = completed_items
        if total_items is not None:
            payload["total_items"] = total_items
        self._emit_event(session_id, run_id, event_type, payload)

    def _stage_progress_pct(self, plan: PipelinePlan, stage: str, *, completed_items: int, total_items: int) -> int:
        executable_stages = [item for item in plan.stages if item != "finalize_reply"]
        stage_index = executable_stages.index(stage) + 1
        stage_start = ((stage_index - 1) / max(len(executable_stages), 1)) * 100
        stage_end = (stage_index / max(len(executable_stages), 1)) * 100
        completion = completed_items / max(total_items, 1)
        return int(stage_start + ((stage_end - stage_start) * completion))

    def _chunk_text(self, content: str) -> list[str]:
        words = content.split()
        if len(words) <= 3:
            return [content]
        chunks: list[str] = []
        for index in range(0, len(words), 3):
            segment = " ".join(words[index : index + 3])
            if index + 3 < len(words):
                segment = f"{segment} "
            chunks.append(segment)
        return chunks or [content]

    def _build_summary(self, run: Run, artifacts: list[Artifact]) -> str:
        images = len([artifact for artifact in artifacts if artifact.kind == "raw_image"])
        prepared = len([artifact for artifact in artifacts if artifact.kind == "prepared_image"])
        objects = len([artifact for artifact in artifacts if artifact.kind == "object3d"])
        return (
            f"Run {run.id} completed. Generated {images} raw images, "
            f"{prepared} prepared PNGs, and {objects} 3D assets."
        )
