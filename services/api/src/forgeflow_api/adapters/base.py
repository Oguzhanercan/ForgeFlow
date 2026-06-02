from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class AdapterHealth:
    ok: bool
    detail: str


class BaseAdapter(ABC):
    capability: str

    @abstractmethod
    def healthcheck(self) -> AdapterHealth:
        raise NotImplementedError


class TextChatAdapter(BaseAdapter):
    capability = "text_chat"

    @abstractmethod
    def generate(self, prompt: str, system_prompt: str | None = None) -> dict[str, Any]:
        raise NotImplementedError


class ImageGenerationAdapter(BaseAdapter):
    capability = "image_generation"

    @abstractmethod
    def generate(self, prompt: str, output_path: Path, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError


class VisionReviewAdapter(BaseAdapter):
    capability = "vision_review"

    @abstractmethod
    def review(self, image_paths: list[Path], prompt: str) -> dict[str, Any]:
        raise NotImplementedError


class Object3DAdapter(BaseAdapter):
    capability = "object3d_generation"

    @abstractmethod
    def generate(self, image_path: Path, output_dir: Path, name: str) -> dict[str, Any]:
        raise NotImplementedError

