from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Iterable

from forgeflow_api.domain.models import Artifact, ChatMessage, ChatSession, ProviderModel, Run, RunEvent


def _serialize(model) -> str:
    return model.model_dump_json()


def _deserialize_many(rows: Iterable[sqlite3.Row], model_cls):
    return [model_cls.model_validate_json(row["payload"]) for row in rows]


class SQLiteStore:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._conn:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        self._init_schema()

    def _init_schema(self) -> None:
        with self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                  id TEXT PRIMARY KEY,
                  created_at TEXT NOT NULL,
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS messages (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS providers (
                  id TEXT PRIMARY KEY,
                  normalized_id TEXT NOT NULL,
                  source_kind TEXT NOT NULL,
                  status TEXT NOT NULL,
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS runs (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                  seq INTEGER PRIMARY KEY AUTOINCREMENT,
                  id TEXT UNIQUE NOT NULL,
                  session_id TEXT NOT NULL,
                  run_id TEXT,
                  type TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS artifacts (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  session_id TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  stage TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  path TEXT NOT NULL,
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS asset_reviews (
                  seq INTEGER PRIMARY KEY AUTOINCREMENT,
                  asset_id TEXT NOT NULL,
                  decision TEXT NOT NULL,
                  note TEXT,
                  created_at TEXT NOT NULL
                );
                """
            )

    def create_session(self, session: ChatSession) -> ChatSession:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO sessions (id, created_at, payload) VALUES (?, ?, ?)",
                (session.id, session.created_at.isoformat(), _serialize(session)),
            )
        return session

    def update_session(self, session: ChatSession) -> ChatSession:
        return self.create_session(session)

    def list_sessions(self) -> list[ChatSession]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload FROM sessions ORDER BY created_at DESC"
            ).fetchall()
        return _deserialize_many(rows, ChatSession)

    def get_session(self, session_id: str) -> ChatSession:
        with self._lock:
            row = self._conn.execute("SELECT payload FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if row is None:
            raise KeyError(session_id)
        return ChatSession.model_validate_json(row["payload"])

    def delete_session(self, session_id: str) -> None:
        with self._lock, self._conn:
            artifact_ids = [
                row["id"]
                for row in self._conn.execute(
                    "SELECT id FROM artifacts WHERE session_id = ?",
                    (session_id,),
                ).fetchall()
            ]
            for artifact_id in artifact_ids:
                self._conn.execute("DELETE FROM asset_reviews WHERE asset_id = ?", (artifact_id,))
            self._conn.execute("DELETE FROM artifacts WHERE session_id = ?", (session_id,))
            self._conn.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
            self._conn.execute("DELETE FROM runs WHERE session_id = ?", (session_id,))
            self._conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            self._conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    def add_message(self, message: ChatMessage) -> ChatMessage:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, created_at, payload) VALUES (?, ?, ?, ?)",
                (message.id, message.session_id, message.created_at.isoformat(), _serialize(message)),
            )
        return message

    def list_messages(self, session_id: str) -> list[ChatMessage]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            ).fetchall()
        return _deserialize_many(rows, ChatMessage)

    def upsert_provider(self, provider: ProviderModel) -> ProviderModel:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO providers (id, normalized_id, source_kind, status, payload)
                VALUES (?, ?, ?, ?, ?)
                """,
                (provider.id, provider.normalized_id, provider.source_kind, provider.status, _serialize(provider)),
            )
        return provider

    def list_providers(self) -> list[ProviderModel]:
        with self._lock:
            rows = self._conn.execute("SELECT payload FROM providers ORDER BY normalized_id ASC").fetchall()
        return _deserialize_many(rows, ProviderModel)

    def get_provider(self, provider_id: str) -> ProviderModel:
        with self._lock:
            row = self._conn.execute("SELECT payload FROM providers WHERE id = ?", (provider_id,)).fetchone()
        if row is None:
            raise KeyError(provider_id)
        return ProviderModel.model_validate_json(row["payload"])

    def add_run(self, run: Run) -> Run:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO runs (id, session_id, status, created_at, updated_at, payload)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run.id,
                    run.session_id,
                    run.status,
                    run.created_at.isoformat(),
                    run.updated_at.isoformat(),
                    _serialize(run),
                ),
            )
        return run

    def update_run(self, run: Run) -> Run:
        return self.add_run(run)

    def list_runs(self) -> list[Run]:
        with self._lock:
            rows = self._conn.execute("SELECT payload FROM runs ORDER BY created_at DESC").fetchall()
        return _deserialize_many(rows, Run)

    def recover_incomplete_runs(self, *, error_message: str = "recovered_after_restart") -> int:
        recovered = 0
        for run in self.list_runs():
            if run.status not in {"queued", "retry_queued", "running"}:
                continue
            run.status = "failed"
            run.error_message = error_message
            self.update_run(run)
            recovered += 1
        return recovered

    def list_runs_for_session(self, session_id: str) -> list[Run]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload FROM runs WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            ).fetchall()
        return _deserialize_many(rows, Run)

    def latest_run_for_session(self, session_id: str, statuses: tuple[str, ...] | None = None) -> Run | None:
        query = "SELECT payload FROM runs WHERE session_id = ?"
        params: list[str] = [session_id]
        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            query += f" AND status IN ({placeholders})"
            params.extend(statuses)
        query += " ORDER BY created_at DESC LIMIT 1"
        with self._lock:
            row = self._conn.execute(query, tuple(params)).fetchone()
        if row is None:
            return None
        return Run.model_validate_json(row["payload"])

    def get_run(self, run_id: str) -> Run:
        with self._lock:
            row = self._conn.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise KeyError(run_id)
        return Run.model_validate_json(row["payload"])

    def next_queued_run(self) -> Run | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT payload FROM runs
                WHERE status IN ('queued', 'retry_queued')
                ORDER BY created_at ASC
                LIMIT 1
                """
            ).fetchone()
        if row is None:
            return None
        return Run.model_validate_json(row["payload"])

    def append_event(self, event: RunEvent) -> RunEvent:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO events (id, session_id, run_id, type, created_at, payload)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event.id,
                    event.session_id,
                    event.run_id,
                    event.type,
                    event.created_at.isoformat(),
                    _serialize(event),
                ),
            )
        return event

    def list_events(self, session_id: str) -> list[RunEvent]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload FROM events WHERE session_id = ? ORDER BY seq ASC",
                (session_id,),
            ).fetchall()
        return _deserialize_many(rows, RunEvent)

    def list_events_after(self, session_id: str, after_seq: int = 0) -> list[tuple[int, RunEvent]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT seq, payload FROM events
                WHERE session_id = ? AND seq > ?
                ORDER BY seq ASC
                """,
                (session_id, after_seq),
            ).fetchall()
        return [(row["seq"], RunEvent.model_validate_json(row["payload"])) for row in rows]

    def add_artifact(self, artifact: Artifact) -> Artifact:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO artifacts (id, run_id, session_id, kind, stage, status, created_at, path, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    artifact.id,
                    artifact.run_id,
                    artifact.session_id,
                    artifact.kind,
                    artifact.stage,
                    artifact.status,
                    artifact.created_at.isoformat(),
                    artifact.path,
                    _serialize(artifact),
                ),
            )
        return artifact

    def update_artifact(self, artifact: Artifact) -> Artifact:
        return self.add_artifact(artifact)

    def list_artifacts_for_run(self, run_id: str) -> list[Artifact]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload FROM artifacts WHERE run_id = ? ORDER BY created_at ASC",
                (run_id,),
            ).fetchall()
        return _deserialize_many(rows, Artifact)

    def list_artifacts_for_session(self, session_id: str) -> list[Artifact]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload FROM artifacts WHERE session_id = ? ORDER BY created_at DESC",
                (session_id,),
            ).fetchall()
        return _deserialize_many(rows, Artifact)

    def get_artifact(self, artifact_id: str) -> Artifact:
        with self._lock:
            row = self._conn.execute("SELECT payload FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        if row is None:
            raise KeyError(artifact_id)
        return Artifact.model_validate_json(row["payload"])

    def add_asset_review(self, asset_id: str, decision: str, note: str | None, created_at: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO asset_reviews (asset_id, decision, note, created_at) VALUES (?, ?, ?, ?)",
                (asset_id, decision, note, created_at),
            )

    def list_asset_reviews(self, asset_id: str) -> list[dict[str, str | None]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT decision, note, created_at FROM asset_reviews
                WHERE asset_id = ?
                ORDER BY seq ASC
                """,
                (asset_id,),
            ).fetchall()
        return [
            {"decision": row["decision"], "note": row["note"], "created_at": row["created_at"]}
            for row in rows
        ]
