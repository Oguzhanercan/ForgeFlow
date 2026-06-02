"use client";

import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@forgeflow/ui";

import { artifactDownloadUrl, fetchRun, fetchRuns } from "../../lib/api";
import { buildArtifactStats, selectProjectRun } from "../../lib/dashboard";
import { detectLocale, formatArtifactGroupLabel, formatFilterLabel, formatIntentLabel, formatRunStatusLabel, formatShortId } from "../../lib/display";


export default function LibraryPage() {
  const locale = detectLocale();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "3d">("all");
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
    refetchInterval: 5000,
  });
  const runs = runsQuery.data ?? [];
  const selectedRun = useMemo(() => selectProjectRun(runs, selectedRunId), [runs, selectedRunId]);

  useEffect(() => {
    const requestedRunId =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("runId") : null;
    if (requestedRunId) {
      setSelectedRunId(requestedRunId);
      return;
    }
    if (!selectedRun && runs.length > 0) {
      setSelectedRunId(selectProjectRun(runs)?.id ?? null);
    }
  }, [runs, selectedRun]);

  const runQuery = useQuery({
    queryKey: ["run", selectedRun?.id],
    queryFn: () => fetchRun(selectedRun!.id),
    enabled: Boolean(selectedRun?.id),
  });

  const artifacts = (runQuery.data?.artifacts ?? []).filter((artifact: { kind: string }) =>
    ["raw_image", "prepared_image", "object3d"].includes(artifact.kind),
  );
  const filteredArtifacts = artifacts.filter((artifact: { kind: string }) => {
    if (filter === "image") {
      return artifact.kind.includes("image");
    }
    if (filter === "3d") {
      return artifact.kind === "object3d";
    }
    return true;
  });
  const stats = buildArtifactStats(artifacts);

  return (
    <AppShell activeNav="Library" title="ForgeFlow" subtitle="Asset Library" statusPill={selectedRun?.status ?? "indexed"}>
      <main className="flex-1 rounded-[30px] bg-[#121314]/94 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "image", "3d"] as const).map((value) => (
              <button
                key={value}
                className={[
                  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                  filter === value ? "bg-[#a4e6ff] text-[#003543]" : "bg-[#181a1b] text-[#d8d5d3]",
                ].join(" ")}
                onClick={() => setFilter(value)}
                type="button"
              >
                {formatFilterLabel(value, locale)}
              </button>
            ))}
          </div>
          <select
            className="rounded-[18px] border border-white/5 bg-[#181a1b] px-3 py-2 text-sm outline-none"
            onChange={(event) => setSelectedRunId(event.target.value)}
            value={selectedRun?.id ?? ""}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {formatShortId(run.id)} · {formatIntentLabel(run.intent_type, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Raw Images" value={stats.rawImages} />
          <StatCard label="Prepared PNGs" value={stats.preparedImages} />
          <StatCard label="3D Assets" value={stats.objects3d} />
          <StatCard label="Run Status" value={formatRunStatusLabel(selectedRun?.status ?? "none", locale)} />
        </div>
        {filteredArtifacts.length === 0 ? (
          <div className="mb-6 rounded-[24px] bg-[#181a1b] p-6 text-sm text-[#859399]">
            {locale === "tr"
              ? "Bu filtre için artifact bulunamadı. Sohbete dönüp yeni üretim başlatabilirsin."
              : "No artifacts found for this filter. Return to chat to create new outputs."}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredArtifacts.map((artifact: { id: string; title: string; kind: string; group_key: string }) => (
            <div key={artifact.id} className="rounded-[24px] bg-[#181a1b] p-4">
              {artifact.kind.includes("image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={artifact.title}
                  className="aspect-[4/3] w-full rounded-[18px] object-cover shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
                  src={artifactDownloadUrl(artifact.id)}
                />
              ) : (
                <a
                  className="flex aspect-[4/3] items-center justify-center rounded-[18px] bg-[#101112] text-sm font-semibold text-[#a4e6ff]"
                  href={`/review?assetId=${artifact.id}`}
                >
                  Open 3D
                </a>
              )}
              <div className="mt-3 text-sm font-semibold">{artifact.title}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">{formatArtifactGroupLabel(artifact.group_key, locale)}</div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[24px] bg-[#181a1b] p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#859399]">{label}</div>
      <div className="mt-2 text-2xl font-bold text-[#e5e2e1]">{value}</div>
    </div>
  );
}
