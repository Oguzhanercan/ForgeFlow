import type { Artifact, Run } from "@forgeflow/contracts";


export function selectProjectRun(runs: Run[], preferredRunId?: string | null) {
  if (preferredRunId) {
    const selected = runs.find((run) => run.id === preferredRunId);
    if (selected) {
      return selected;
    }
  }
  const completed = runs
    .filter((run) => run.status === "completed")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (completed.length > 0) {
    return completed[0];
  }
  return runs.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}


export function buildArtifactStats(artifacts: Artifact[]) {
  return {
    rawImages: artifacts.filter((artifact) => artifact.kind === "raw_image").length,
    preparedImages: artifacts.filter((artifact) => artifact.kind === "prepared_image").length,
    objects3d: artifacts.filter((artifact) => artifact.kind === "object3d").length,
    catalogs: artifacts.filter((artifact) => artifact.kind === "catalog").length,
  };
}


export function buildProjectIndex(runs: Run[]) {
  const grouped = runs.reduce<Map<string, Run[]>>((acc, run) => {
    const bucket = acc.get(run.session_id) ?? [];
    bucket.push(run);
    acc.set(run.session_id, bucket);
    return acc;
  }, new Map());

  return Array.from(grouped.entries())
    .map(([sessionId, sessionRuns]) => {
      const sorted = sessionRuns
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const latest = sorted[0];
      return {
        sessionId,
        latestRunId: latest?.id ?? "",
        latestStatus: latest?.status ?? "unknown",
        latestIntentType: latest?.intent_type ?? "unknown",
        latestCreatedAt: latest?.created_at ?? "",
        runCount: sessionRuns.length,
        completedRuns: sessionRuns.filter((run) => run.status === "completed").length,
        failedRuns: sessionRuns.filter((run) => run.status === "failed").length,
        runningRuns: sessionRuns.filter((run) => ["running", "queued", "awaiting_review_mode"].includes(run.status)).length,
      };
    })
    .sort((a, b) => String(b.latestCreatedAt).localeCompare(String(a.latestCreatedAt)));
}
