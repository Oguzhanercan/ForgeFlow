import type { RunStatus } from "./types";

const statusConfig: Record<RunStatus, { label: string; className: string; dot: string }> = {
  idle: { label: "Idle", className: "bg-[#1e1f20] text-[#859399]", dot: "bg-[#859399]" },
  queued: { label: "Queued", className: "bg-[#1e1a14] text-[#d4a853]", dot: "bg-amber-400" },
  running: { label: "Running", className: "bg-[#0d2932] text-[#00d1ff]", dot: "bg-[#00d1ff] animate-pulse" },
  completed: { label: "Completed", className: "bg-[#0e2313] text-[#4ade80]", dot: "bg-[#4ade80]" },
  failed: { label: "Failed", className: "bg-[#250e0e] text-[#f87171]", dot: "bg-[#f87171]" },
  needs_review: { label: "Needs Review", className: "bg-[#1e1a14] text-[#d4a853]", dot: "bg-amber-400 animate-pulse" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${config.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
