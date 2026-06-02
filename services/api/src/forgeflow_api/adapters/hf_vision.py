from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from forgeflow_api.adapters.base import AdapterHealth, VisionReviewAdapter


class HuggingFaceVisionReviewAdapter(VisionReviewAdapter):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id

    def healthcheck(self) -> AdapterHealth:
        try:
            import torch
        except Exception as exc:
            return AdapterHealth(ok=False, detail=f"torch_unavailable:{exc}")
        if not torch.cuda.is_available():
            return AdapterHealth(ok=False, detail="cuda_unavailable_for_vlm")
        return AdapterHealth(ok=True, detail=f"registered:{self.model_id}")

    @lru_cache(maxsize=1)
    def _load_pipeline(self):
        from transformers import pipeline

        return pipeline(
            "image-text-to-text",
            model=self.model_id,
            torch_dtype="auto",
            device_map="auto",
            trust_remote_code=True,
        )

    def review(self, image_paths: list[Path], prompt: str):
        reviewer = self._load_pipeline()
        result = reviewer(images=[str(path) for path in image_paths], text=prompt, max_new_tokens=256)
        return {
            "status": "reviewed",
            "model": self.model_id,
            "result": result,
        }
