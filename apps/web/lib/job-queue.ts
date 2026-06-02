import type { Run } from "@forgeflow/contracts";

import type { LiveSessionState } from "./live-session";

export type WorkspaceJobStatus = "queued" | "running" | "failed";

export type LocalWorkspaceJob = {
  id: string;
  label: string;
  status: WorkspaceJobStatus;
  percent: number;
  createdAt: string;
};

export type WorkspaceJob = LocalWorkspaceJob & {
  source: "server" | "local";
};

const activeServerStatuses = new Set(["queued", "retry_queued", "running", "awaiting_review_mode"]);

export function buildWorkspaceJobs({
  liveState,
  localJobs,
  runs,
}: {
  liveState: LiveSessionState;
  localJobs: LocalWorkspaceJob[];
  runs: Run[];
}): WorkspaceJob[] {
  const serverJobs = runs
    .filter((run) => activeServerStatuses.has(run.status))
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((run): WorkspaceJob => {
      const progress = liveState.runProgressByRun[run.id];
      const status = progress?.status === "running" || run.status === "running" ? "running" : run.status === "failed" ? "failed" : "queued";
      return {
        id: run.id,
        label: progress?.label ?? formatIntentLabel(run.intent_type),
        status,
        percent: status === "running" ? progress?.percent ?? 8 : 0,
        createdAt: String(run.created_at),
        source: "server",
      };
    });

  const bundledRunIds = new Set(serverJobs.map((job) => job.id));
  const liveJobs = Object.values(liveState.runProgressByRun)
    .filter((progress) => !bundledRunIds.has(progress.runId))
    .filter((progress) => progress.status === "queued" || progress.status === "running")
    .map((progress): WorkspaceJob => ({
      id: progress.runId,
      label: progress.label,
      status: progress.status === "running" ? "running" : "queued",
      percent: progress.status === "running" ? progress.percent : 0,
      createdAt: progress.createdAt ?? "",
      source: "server",
    }));

  const local = localJobs
    .filter((job) => job.status === "queued" || job.status === "running" || job.status === "failed")
    .map((job): WorkspaceJob => ({ ...job, source: "local" }));

  return [...serverJobs, ...liveJobs, ...local].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function formatIntentLabel(intent: string) {
  return intent
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
