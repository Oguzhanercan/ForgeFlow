from __future__ import annotations

from collections import defaultdict
from typing import Any


def build_master_catalog(*, run_id: str, artifacts: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for artifact in artifacts:
        grouped[artifact.get("group", "ungrouped")].append(artifact)

    groups = [
        {
            "group": group,
            "items": items,
        }
        for group, items in sorted(grouped.items())
    ]
    return {
        "run_id": run_id,
        "entry_count": len(artifacts),
        "groups": groups,
        "entries": artifacts,
    }

