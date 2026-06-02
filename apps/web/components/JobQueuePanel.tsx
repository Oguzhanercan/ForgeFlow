"use client";

import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

import type { WorkspaceJob } from "../lib/job-queue";

export function JobQueuePanel({ jobs }: { jobs: WorkspaceJob[] }) {
  if (jobs.length === 0) return null;

  const running = jobs.filter((job) => job.status === "running").length;
  const queued = jobs.filter((job) => job.status === "queued").length;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 w-[300px]">
      <div className="pointer-events-auto overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#111314]/95 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#0d2932] text-[#00d1ff]">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dff7ff]">Job Queue</div>
              <div className="text-[10px] text-[#5a6368]">{running} running · {queued} queued</div>
            </div>
          </div>
          <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-[#a4e6ff]">{jobs.length}</span>
        </div>

        <div className="space-y-1.5 p-2">
          {jobs.slice(0, 5).map((job) => {
            const Icon = job.status === "failed" ? AlertTriangle : job.status === "queued" ? Clock3 : CheckCircle2;
            const pct = Math.max(0, Math.min(100, job.percent));
            const barClass = job.status === "failed" ? "h-full rounded-full bg-[#f87171]" : job.status === "queued" ? "h-full rounded-full bg-[#d4a853]" : "h-full rounded-full bg-[#00d1ff] transition-all duration-300";
            return (
              <div key={job.id} className="rounded-[12px] bg-white/[0.035] px-3 py-2">
                <div className="flex items-center gap-2">
                  <Icon className={job.status === "failed" ? "h-3.5 w-3.5 text-[#f87171]" : job.status === "queued" ? "h-3.5 w-3.5 text-[#d4a853]" : "h-3.5 w-3.5 text-[#00d1ff]"} />
                  <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#d2d0ce]">{job.label}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#5a6368]">{job.source}</div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={barClass}
                    style={{ width: `${job.status === "queued" ? 12 : pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
