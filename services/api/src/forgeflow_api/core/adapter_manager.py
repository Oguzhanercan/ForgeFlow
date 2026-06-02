from __future__ import annotations

from typing import Callable

from forgeflow_api.adapters.base import BaseAdapter
from forgeflow_api.domain.models import ProviderModel


class AdapterManager:
    def __init__(self) -> None:
        self._adapters: dict[str, BaseAdapter] = {}
        self._factories: dict[str, Callable[[], BaseAdapter]] = {}

    def register(self, key: str, adapter: BaseAdapter) -> None:
        self._adapters[key] = adapter

    def register_factory(self, key: str, factory: Callable[[], BaseAdapter]) -> None:
        self._factories[key] = factory

    def has(self, provider: ProviderModel | str, capability: str | None = None) -> bool:
        provider_id = provider.id if isinstance(provider, ProviderModel) else provider
        lookup_keys = [provider_id]
        if capability:
            lookup_keys.insert(0, f"{provider_id}:{capability}")
        return any(key in self._adapters or key in self._factories for key in lookup_keys)

    def get(self, provider: ProviderModel | str, capability: str | None = None) -> BaseAdapter:
        provider_id = provider.id if isinstance(provider, ProviderModel) else provider
        lookup_keys = [provider_id]
        if capability:
            lookup_keys.insert(0, f"{provider_id}:{capability}")
        for key in lookup_keys:
            if key in self._adapters:
                return self._adapters[key]
            if key in self._factories:
                adapter = self._factories[key]()
                self._adapters[key] = adapter
                return adapter
        raise KeyError(f"adapter not registered for {provider_id} ({capability or 'default'})")
