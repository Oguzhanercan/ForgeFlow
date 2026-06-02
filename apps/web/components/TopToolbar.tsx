"use client";

import { PanelLeft, PanelRight, Play, Share2, Download } from "lucide-react";
import { useForgeFlowUiStore } from "../lib/store";
import { RunStatusBadge } from "./RunStatusBadge";
import { CreditBadge } from "./CreditBadge";

const panelLabels: Record<string, string> = {
  chat: "Chat",
  projects: "Projects",
  runs: "Runs",
  library: "Library",
  models: "Models",
  "3d": "3D Assets",
  settings: "Settings",
};

export function TopToolbar({ progressLabel, progressPercent }: { progressLabel?: string | null; progressPercent?: number | null }) {
  const projectName = useForgeFlowUiStore((s) => s.projectName);
  const runStatus = useForgeFlowUiStore((s) => s.runStatus);
  const credits = useForgeFlowUiStore((s) => s.credits);
  const activePanel = useForgeFlowUiStore((s) => s.activePanel);
  const toggleSidebar = useForgeFlowUiStore((s) => s.toggleSidebar);
  const toggleInspector = useForgeFlowUiStore((s) => s.toggleInspector);

  const clampedProgress = typeof progressPercent === "number" ? Math.max(0, Math.min(100, progressPercent)) : null;

  return (
    <header className="sticky top-0 z-20 h-12 border-b border-white/[0.04] bg-[#0c0c0d]/95 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-3">
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5a6368] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate font-headline text-[13px] font-semibold tracking-tight text-[#dff7ff]">
            {projectName}
          </div>
          <div className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-[#00d1ff]">
            {panelLabels[activePanel] ?? activePanel}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[#5a6368]">Autosaved</span>

          <RunStatusBadge status={runStatus} />

          <CreditBadge credits={credits} />

          <div className="ml-1 flex items-center gap-1">
            <button className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5a6368] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">
              <Share2 className="h-4 w-4" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5a6368] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">
              <Download className="h-4 w-4" />
            </button>
            <button className="flex items-center gap-2 rounded-[10px] bg-[#00d1ff] px-4 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#0a0f11] transition hover:bg-[#00bce8]">
              <Play className="h-3.5 w-3.5 fill-current" />
              Run
            </button>
          </div>

          <button
            onClick={toggleInspector}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5a6368] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {runStatus === "running" && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.04]">
          <div
            className="h-full bg-[#00d1ff] shadow-[0_0_18px_rgba(0,209,255,0.45)] transition-all duration-300"
            style={{ width: `${clampedProgress ?? 18}%` }}
            title={progressLabel ? `${progressLabel} ${clampedProgress ?? 0}%` : "Run in progress"}
          />
        </div>
      )}
    </header>
  );
}
