"use client";

import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@forgeflow/ui";

import { artifactDownloadUrl, fetchProjectCatalog, fetchRuns } from "../../lib/api";
import { buildArtifactStats, buildProjectIndex, selectProjectRun } from "../../lib/dashboard";
import { detectLocale, formatArtifactGroupLabel, formatIntentLabel, formatShortId } from "../../lib/display";


type CatalogGroup = {
  group: string;
  items: Array<{
    artifact_id: string;
    title: string;
    kind: string;
    status: string;
    path?: string;
    group?: string;
  }>;
};

export function ProjectsClient() {
  const locale = detectLocale();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
    refetchInterval: 5000,
  });

  const runs = runsQuery.data ?? [];
  const projects = useMemo(() => buildProjectIndex(runs), [runs]);
  const selectedRun = useMemo(() => selectProjectRun(runs, selectedRunId), [runs, selectedRunId]);

  useEffect(() => {
    const requestedRunId =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("runId") : null;
    if (requestedRunId) {
      setSelectedRunId(requestedRunId);
      return;
    }
    if (!selectedRun && projects.length > 0) {
      setSelectedRunId(projects[0].latestRunId);
    }
  }, [projects, selectedRun]);

  const catalogQuery = useQuery({
    queryKey: ["catalog", selectedRun?.id],
    queryFn: () => fetchProjectCatalog(selectedRun!.id),
    enabled: Boolean(selectedRun?.id),
  });

  const groups: CatalogGroup[] = catalogQuery.data?.groups ?? [];
  const allItems = groups.flatMap((group) => group.items);
  const stats = buildArtifactStats(
    allItems.map((item) => ({
      id: item.artifact_id,
      run_id: selectedRun?.id ?? "run",
      session_id: selectedRun?.session_id ?? "session",
      stage: "catalog",
      kind: item.kind as "raw_image" | "prepared_image" | "object3d" | "catalog",
      status: item.status,
      title: item.title,
      group_key: item.group ?? "default",
      path: item.path ?? "",
      created_at: selectedRun?.created_at ?? new Date().toISOString(),
    })),
  );

  return (
    <AppShell activeNav="Projects" title="ForgeFlow" subtitle="Project Catalogs" statusPill={selectedRun?.status ?? "idle"}>
      <main className="flex-1 rounded-[30px] bg-[#121314]/94 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-6 lg:p-8">
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {projects.map((project) => (
            <button
              key={project.sessionId}
              className={[
                "rounded-[24px] p-4 text-left transition duration-200",
                project.latestRunId === selectedRun?.id
                  ? "bg-[#202324] text-[#a4e6ff] shadow-[0_18px_50px_rgba(0,209,255,0.08)]"
                  : "bg-[#181a1b] text-[#e5e2e1] hover:bg-[#202224]",
              ].join(" ")}
              onClick={() => setSelectedRunId(project.latestRunId)}
              type="button"
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#859399]">Session {formatShortId(project.sessionId)}</div>
              <div className="mt-2 text-base font-semibold">{formatIntentLabel(project.latestIntentType, locale)}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MetricChip label="Runs" value={project.runCount} />
                <MetricChip label="Done" value={project.completedRuns} />
                <MetricChip label="Live" value={project.runningRuns} />
              </div>
            </button>
          ))}
        </div>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-8">
            {groups.length === 0 ? (
              <div className="rounded-[24px] bg-[#181a1b] p-6 text-sm text-[#859399]">
                {selectedRun
                  ? locale === "tr"
                    ? `${formatIntentLabel(selectedRun.intent_type, locale)} için henüz gruplanmış katalog yok.`
                    : `No grouped catalog yet for ${formatIntentLabel(selectedRun.intent_type, locale)}.`
                  : locale === "tr"
                    ? "Henüz gruplanmış katalog yok."
                    : "No grouped catalog yet."}
              </div>
            ) : null}
            {groups.map((group) => (
              <div key={group.group}>
                <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#a4e6ff]">{formatArtifactGroupLabel(group.group, locale)}</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {group.items.map((item) => (
                    <div key={item.artifact_id} className="rounded-[22px] bg-[#181a1b] p-4">
                      {item.kind.includes("image") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={item.title}
                          className="aspect-square w-full rounded-[18px] object-cover shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
                          src={artifactDownloadUrl(item.artifact_id)}
                        />
                      ) : (
                        <a
                          className="flex aspect-square items-center justify-center rounded-[18px] bg-[#101112] text-sm font-semibold text-[#a4e6ff]"
                          href={`/review?assetId=${item.artifact_id}`}
                        >
                          Open 3D
                        </a>
                      )}
                      <div className="mt-3 font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">{item.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <aside className="rounded-[24px] bg-[#181a1b] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">Project Inspector</div>
            <div className="mt-4 space-y-3 text-sm text-[#e5e2e1]">
              <div>Selected run: {selectedRun ? formatShortId(selectedRun.id) : "none"}</div>
              <div>Session: {selectedRun ? formatShortId(selectedRun.session_id) : "none"}</div>
              <div>Entry count: {catalogQuery.data?.entry_count ?? 0}</div>
              <div>Images: {stats.rawImages + stats.preparedImages}</div>
              <div>3D assets: {stats.objects3d}</div>
              <div className="rounded-[18px] bg-[#232526] p-4 text-[#859399]">
                Project catalogs group the artifacts a coding agent needs to place, reuse, and inspect assets by run.
              </div>
              <div className="border-t border-white/5 pt-4">
                <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[#859399]">Recent Projects</div>
                <div className="space-y-2">
                  {projects.map((project) => (
                    <button
                      key={project.sessionId}
                      className={[
                        "w-full rounded-[18px] px-3 py-3 text-left text-xs transition duration-200",
                        project.latestRunId === selectedRun?.id ? "bg-[#232526] text-[#a4e6ff]" : "bg-[#101112] text-[#d8d5d3]",
                      ].join(" ")}
                      onClick={() => setSelectedRunId(project.latestRunId)}
                      type="button"
                    >
                      <div className="truncate font-semibold">{formatShortId(project.sessionId)}</div>
                      <div className="mt-1 uppercase tracking-[0.12em] text-[#859399]">{formatIntentLabel(project.latestIntentType, locale)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-[#101112] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#859399]">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
