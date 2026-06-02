from __future__ import annotations

import os
from typing import Any

import httpx

from forgeflow_api.adapters.base import AdapterHealth, TextChatAdapter


class OpenRouterTextAdapter(TextChatAdapter):
    def __init__(self, model: str = "openai/gpt-4.1-mini") -> None:
        self.model = model
        self.api_key = os.getenv("OPENROUTER_API_KEY")

    def healthcheck(self) -> AdapterHealth:
        if not self.api_key:
            return AdapterHealth(ok=False, detail="OPENROUTER_API_KEY is not configured")
        return AdapterHealth(ok=True, detail=f"ready:{self.model}")

    def generate(self, prompt: str, system_prompt: str | None = None) -> dict[str, Any]:
        if not self.api_key:
            return {
                "provider": "openrouter",
                "model": self.model,
                "content": "OpenRouter key missing. Falling back to local planning heuristics.",
                "status": "degraded"
            }
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [],
        }
        if system_prompt:
            payload["messages"].append({"role": "system", "content": system_prompt})
        payload["messages"].append({"role": "user", "content": prompt})
        with httpx.Client(timeout=60) as client:
            response = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        return {
            "provider": "openrouter",
            "model": self.model,
            "content": data["choices"][0]["message"]["content"],
            "status": "ok"
        }
