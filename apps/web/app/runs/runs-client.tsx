"use client";

import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@forgeflow/ui";

import { fetchRun, fetchRuns, retryRun } from "../../lib/api";
import { buildArtifactStats } from "../../lib/dashboard";
import { detectLocale, formatIntentLabel, formatRunStatusLabel, formatShortId } from "../../lib/display";

function buildProjectHref(sessionId: string, runId: string) {
  const params = new URLSearchParams({ sessionId, runId });
  return `/projects?${params.toString()}`;
}

function buildLibraryHref(runId: string) {
  const params = new URLSearchParams({ runId });
  return `/library?${params.toString()}`;
}

function rowClasses(status: string, active: boolean) {
  const awaiting = status === "awaiting_review_mode";
  return [
    awaiting ? "bg-amber-500/10" : "",
    active ? "ring-1 ring-[#3fbfe1]/20 shadow-[0_18px_50px_rgba(0,209,255,0.08)]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function RunsClient() {
  const locale = detectLocale();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
    refetchInterval: 5000,
  });

  const retryMutation = useMutation({
    mutationFn: (runId: string) => retryRun(runId),
    onSuccess: async (result) => {
      setRetryFeedback(
        locale === "tr"
          ? `${formatShortId(result.run_id)} tekrar kuyruğa alındı.`
          : `${formatShortId(result.run_id)} queued for retry.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    onError: (error) => {
      setRetryFeedback(error instanceof Error ? error.message : locale === "tr" ? "Retry başarısız." : "Retry failed.");
    },
  });

  const runs = query.data ?? [];
  const selectedRun = useMemo(
    () =>
      runs.find((run) => run.id === selectedRunId) ??
      runs.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ??
      null,
    [runs, selectedRunId],
  );

  useEffect(() => {
    if (!selectedRunId && selectedRun) {
      setSelectedRunId(selectedRun.id);
    }
  }, [selectedRun, selectedRunId]);

  const runDetailQuery = useQuery({
    queryKey: ["run", selectedRun?.id],
    queryFn: () => fetchRun(selectedRun!.id),
    enabled: Boolean(selectedRun?.id),
    refetchInterval: selectedRun?.status === "completed" || selectedRun?.status === "failed" ? false : 5000,
  });

  const stats = buildArtifactStats(runDetailQuery.data?.artifacts ?? []);

  return (
    <AppShell activeNav="Runs" title="ForgeFlow" subtitle="Runs Dashboard" statusPill={formatRunStatusLabel(selectedRun?.status ?? "queued", locale)}>
      <main className="flex-1 rounded-[30px] bg-[#121314]/94 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-6 lg:p-8">
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Completed" value={runs.filter((run) => run.status === "completed").length} />
          <SummaryCard label="Running" value={runs.filter((run) => run.status === "running").length} />
          <SummaryCard
            label={locale === "tr" ? "Aksiyon Gerekli" : "Action Required"}
            value={runs.filter((run) => run.status === "awaiting_review_mode").length}
          />
          <SummaryCard label="Failed" value={runs.filter((run) => run.status === "failed").length} />
        </div>
        {retryFeedback ? <div className="mb-4 rounded-2xl bg-[#181a1b] px-4 py-3 text-sm text-[#a4e6ff]">{retryFeedback}</div> : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="grid gap-3 lg:hidden">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className={`rounded-[22px] bg-[#181a1b] p-4 transition duration-200 ${rowClasses(run.status, run.id === selectedRun?.id)}`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{formatShortId(run.id)}</div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#859399]">
                        {formatIntentLabel(run.intent_type, locale)}
                      </div>
                    </div>
                    <div className="rounded-full bg-[#101112] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a4e6ff]">
                      {formatRunStatusLabel(run.status, locale)}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-[#859399]">Session {formatShortId(run.session_id)}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded-full bg-[#101112] px-3 py-2 text-xs font-semibold text-[#a4e6ff] disabled:opacity-50"
                      disabled={retryMutation.isPending && retryMutation.variables === run.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        retryMutation.mutate(run.id);
                      }}
                      type="button"
                    >
                      {retryMutation.isPending && retryMutation.variables === run.id ? "Retrying..." : "Retry"}
                    </button>
                    <a
                      className="rounded-full bg-[#101112] px-3 py-2 text-xs font-semibold text-[#e5e2e1]"
                      href={buildProjectHref(run.session_id, run.id)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-[24px] bg-[#181a1b] lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#2a2a2a] text-xs uppercase tracking-[0.16em] text-[#859399]">
                  <tr>
                    <th className="px-4 py-3">Run</th>
                    <th className="px-4 py-3">Session</th>
                    <th className="px-4 py-3">Intent</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className={`cursor-pointer border-t border-white/5 ${rowClasses(run.status, run.id === selectedRun?.id)}`}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <td className="px-4 py-3">{formatShortId(run.id)}</td>
                      <td className="px-4 py-3">{formatShortId(run.session_id)}</td>
                      <td className="px-4 py-3">{formatIntentLabel(run.intent_type, locale)}</td>
                      <td className="px-4 py-3">{formatRunStatusLabel(run.status, locale)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            className="rounded-full bg-[#131313] px-3 py-2 text-xs font-semibold text-[#a4e6ff] disabled:opacity-50"
                            disabled={retryMutation.isPending && retryMutation.variables === run.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              retryMutation.mutate(run.id);
                            }}
                            type="button"
                          >
                            {retryMutation.isPending && retryMutation.variables === run.id ? "Retrying..." : "Retry"}
                          </button>
                          <a
                            className="rounded-full bg-[#131313] px-3 py-2 text-xs font-semibold text-[#e5e2e1]"
                            href={buildProjectHref(run.session_id, run.id)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="rounded-[24px] bg-[#181a1b] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">Run Inspector</div>
            <div className="mt-4 space-y-3 text-sm text-[#e5e2e1]">
              <div>Run: {selectedRun ? formatShortId(selectedRun.id) : "none"}</div>
              <div>Session: {selectedRun ? formatShortId(selectedRun.session_id) : "none"}</div>
              <div>Intent: {selectedRun ? formatIntentLabel(selectedRun.intent_type, locale) : "none"}</div>
              <div>Status: {selectedRun ? formatRunStatusLabel(selectedRun.status, locale) : "none"}</div>
              <div>
                Created:{" "}
                {selectedRun ? new Date(String(selectedRun.created_at)).toLocaleString("tr-TR") : "none"}
              </div>
              <div>Raw images: {stats.rawImages}</div>
              <div>Prepared PNGs: {stats.preparedImages}</div>
              <div>3D assets: {stats.objects3d}</div>
              <div>Catalogs: {stats.catalogs}</div>
              <div className="rounded-[18px] bg-[#232526] p-4 text-[#859399]">
                {selectedRun?.status === "awaiting_review_mode"
                  ? locale === "tr"
                    ? "Bu run inceleme modu seçimi bekliyor."
                    : "This run is waiting for a review mode choice."
                  : locale === "tr"
                    ? "Bu panel seçili run için artifact birikimini ve durumu gösterir."
                    : "This panel shows artifact accumulation and status for the selected run."}
              </div>
              {selectedRun ? (
                <div className="flex flex-wrap gap-2">
                  <a className="rounded-full bg-[#131313] px-3 py-2 text-xs font-semibold text-[#a4e6ff]" href={buildProjectHref(selectedRun.session_id, selectedRun.id)}>
                    Open Project
                  </a>
                  <a className="rounded-full bg-[#131313] px-3 py-2 text-xs font-semibold text-[#e5e2e1]" href={buildLibraryHref(selectedRun.id)}>
                    Open Library
                  </a>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] bg-[#181a1b] p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#859399]">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
