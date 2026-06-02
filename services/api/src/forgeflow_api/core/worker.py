from __future__ import annotations

import threading

from forgeflow_api.core.pipeline_engine import PipelineEngine
from forgeflow_api.core.store import SQLiteStore
from forgeflow_api.domain.planner import RequestPlanner
from forgeflow_api.domain.models import utcnow


class RunWorker:
    def __init__(
        self,
        store: SQLiteStore,
        pipeline_engine: PipelineEngine,
        planner: RequestPlanner,
        poll_interval: float = 1.0,
    ) -> None:
        self.store = store
        self.pipeline_engine = pipeline_engine
        self.planner = planner
        self.poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, daemon=True, name="forgeflow-run-worker")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def process_next_once(self) -> bool:
        run = self.store.next_queued_run()
        if run is None:
            return False
        try:
            run.status = "running"
            run.updated_at = utcnow()
            self.store.update_run(run)
            session_messages = self.store.list_messages(run.session_id)
            user_message = next(
                (message for message in session_messages if message.id == run.source_message_id),
                session_messages[-1],
            )
            self.pipeline_engine.execute_run(run, user_message)
        except Exception as exc:
            run.status = "failed"
            run.error_message = str(exc)
            run.updated_at = utcnow()
            self.store.update_run(run)
            self.pipeline_engine._emit_event(run.session_id, run.id, "run.failed", {"run_id": run.id, "error": str(exc)})
        return True

    def _loop(self) -> None:
        while not self._stop.is_set():
            processed = self.process_next_once()
            if not processed:
                self._stop.wait(self.poll_interval)
