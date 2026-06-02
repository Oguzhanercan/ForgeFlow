from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from forgeflow_api.adapters.base import AdapterHealth, TextChatAdapter


class HuggingFaceTextAdapter(TextChatAdapter):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id

    def healthcheck(self) -> AdapterHealth:
        exists = Path(self.model_id).exists()
        return AdapterHealth(ok=True, detail=f"registered:{self.model_id}:{'local' if exists else 'remote'}")

    @lru_cache(maxsize=1)
    def _load_pipeline(self):
        from transformers import pipeline

        return pipeline(
            "text-generation",
            model=self.model_id,
            tokenizer=self.model_id,
            torch_dtype="auto",
            device_map="auto",
            trust_remote_code=True,
        )

    def generate(self, prompt: str, system_prompt: str | None = None) -> dict[str, Any]:
        generator = self._load_pipeline()
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        result: list[dict[str, Any]] = generator(
            full_prompt,
            max_new_tokens=384,
            do_sample=False,
            return_full_text=False,
        )
        return {
            "provider": "huggingface",
            "model": self.model_id,
            "content": result[0].get("generated_text") or result[0].get("generated_text", ""),
            "status": "ok",
        }
