"use client";

import { Plus, Clock, FolderKanban, Layout, Image, Search } from "lucide-react";
import type { SessionSummary } from "@forgeflow/contracts";
import { useForgeFlowUiStore } from "../lib/store";
import type { SidebarTab, WorkspaceCard } from "./types";

const tabs: { id: SidebarTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "recent", label: "Recent", icon: Clock },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "templates", label: "Templates", icon: Layout },
  { id: "assets", label: "Assets", icon: Image },
];

const demoWorkspaces: WorkspaceCard[] = [
  { id: "1", title: "Character Portrait Pipeline", assetCount: 12, runCount: 4, updatedAt: "2 min ago", status: "completed" },
  { id: "2", title: "Fantasy Weapon Set", assetCount: 8, runCount: 3, updatedAt: "15 min ago", status: "completed" },
  { id: "3", title: "Gothic Castle Scene", assetCount: 5, runCount: 2, updatedAt: "1 hour ago", status: "running" },
  { id: "4", title: "Cyberpunk Environment", assetCount: 18, runCount: 6, updatedAt: "3 hours ago", status: "completed" },
  { id: "5", title: "UI Icon Pack", assetCount: 24, runCount: 8, updatedAt: "Yesterday", status: "failed" },
];

type ProjectSidebarProps = {
  activeSessionId?: string | null;
  isCreating?: boolean;
  sessions?: SessionSummary[];
  onCreateSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
};

export function ProjectSidebar({
  activeSessionId,
  isCreating = false,
  sessions,
  onCreateSession,
  onSelectSession,
}: ProjectSidebarProps) {
  const activeTab = useForgeFlowUiStore((s) => s.activeSidebarTab);
  const setActiveTab = useForgeFlowUiStore((s) => s.setActiveSidebarTab);
  const projectName = useForgeFlowUiStore((s) => s.projectName);
  const setProjectName = useForgeFlowUiStore((s) => s.setProjectName);
  const sidebarCollapsed = useForgeFlowUiStore((s) => s.sidebarCollapsed);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-headline text-sm font-bold tracking-tight text-[#dff7ff]">
                {projectName}
              </div>
            </div>
            <button className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.04] text-[#5a6368] transition hover:bg-white/[0.08] hover:text-[#a4e6ff]">
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-3 pt-3">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#0d2932] py-2.5 text-xs font-semibold text-[#00d1ff] transition hover:bg-[#0e313b] disabled:opacity-50"
              disabled={isCreating}
              onClick={onCreateSession}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              {isCreating ? "Creating..." : "New Project"}
            </button>
          </div>

          <div className="mt-3 flex gap-0.5 px-3">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all duration-200",
                    active
                      ? "bg-white/[0.06] text-[#a4e6ff]"
                      : "text-[#5a6368] hover:bg-white/[0.03] hover:text-[#859399]",
                  ].join(" ")}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
            <div className="flex flex-col gap-1">
              {(sessions?.length ? sessions : demoWorkspaces).map((item) => {
                const isSession = "created_at" in item;
                const id = item.id;
                const active = isSession && id === activeSessionId;
                const title = item.title;
                const meta = isSession
                  ? `${new Date(String(item.created_at)).toLocaleDateString()}`
                  : `${item.assetCount} assets · ${item.runCount} runs · ${item.updatedAt}`;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setProjectName(title);
                      if (isSession) onSelectSession?.(id);
                    }}
                    className={[
                      "flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5 text-left transition hover:bg-white/[0.04]",
                      active ? "bg-[#0d2932]/70 ring-1 ring-[#00d1ff]/20" : "",
                    ].join(" ")}
                  >
                    <div className="text-[13px] font-medium text-[#d2d0ce]">{title}</div>
                    <div className="flex items-center gap-1 text-[10px] text-[#5a6368]">
                      <span>{meta}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
    </div>
  );
}
