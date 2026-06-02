from __future__ import annotations

import json
import os
import subprocess

import pytest

from forgeflow_api.adapters.nvidia import resolve_nvidia_api_key


pytestmark = pytest.mark.skipif(
    os.getenv("FORGEFLOW_RUN_NVIDIA_SMOKE_TESTS") != "1",
    reason="live NVIDIA smoke tests are opt-in",
)


def test_nvidia_minimax_m2_7_smoke_receives_first_stream_chunk():
    key = resolve_nvidia_api_key()
    assert key

    payload = json.dumps(
        {
            "model": "minimaxai/minimax-m2.7",
            "messages": [{"role": "user", "content": "pong"}],
            "temperature": 1,
            "top_p": 0.95,
            "max_tokens": 1,
            "stream": True,
            "chat_template_kwargs": {"thinking": True},
        }
    )
    completed = subprocess.run(
        [
            "curl",
            "-sS",
            "-N",
            "-H",
            f"Authorization: Bearer {key}",
            "-H",
            "Accept: text/event-stream",
            "-H",
            "Content-Type: application/json",
            "--data",
            payload,
            "https://integrate.api.nvidia.com/v1/chat/completions",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=150,
    )

    first_event = None
    for line in completed.stdout.splitlines():
        if not line.startswith("data: "):
            continue
        data = line.removeprefix("data: ").strip()
        if data == "[DONE]":
            break
        first_event = json.loads(data)
        break

    assert first_event is not None
    assert first_event["model"] == "minimaxai/minimax-m2.7"
    assert first_event["choices"]
