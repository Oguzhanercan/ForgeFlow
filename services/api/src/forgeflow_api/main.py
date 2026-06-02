from __future__ import annotations

import os
import sys
import tempfile

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from forgeflow_api.core.dependencies import ServiceContainer, build_container
from forgeflow_api.routes.assets import router as assets_router
from forgeflow_api.routes.chat import router as chat_router
from forgeflow_api.routes.projects import router as projects_router
from forgeflow_api.routes.providers import router as providers_router
from forgeflow_api.routes.runs import router as runs_router


def _allowed_origins() -> list[str]:
    configured = os.getenv("FORGEFLOW_ALLOWED_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:3333",
        "http://localhost:3333",
    ]


def create_app(container: ServiceContainer | None = None) -> FastAPI:
    app = FastAPI(title="ForgeFlow API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    if container is None:
        if os.getenv("PYTEST_CURRENT_TEST"):
            temp_root = tempfile.mkdtemp(prefix="forgeflow-test-")
            app.state.container = build_container(data_root=temp_root, start_worker=False, register_defaults=False)
        else:
            app.state.container = build_container()
    else:
        app.state.container = container
    app.include_router(chat_router)
    app.include_router(runs_router)
    app.include_router(providers_router)
    app.include_router(assets_router)
    app.include_router(projects_router)

    @app.get("/health")
    def healthcheck():
        return {"status": "ok"}

    @app.on_event("shutdown")
    def shutdown_worker():
        if getattr(app.state, "container", None) is not None:
            app.state.container.worker.stop()

    return app


if os.getenv("PYTEST_CURRENT_TEST") or "pytest" in sys.modules:
    app = create_app(
        container=build_container(
            data_root=tempfile.mkdtemp(prefix="forgeflow-test-"),
            start_worker=False,
            register_defaults=False,
        )
    )
else:
    app = create_app()
