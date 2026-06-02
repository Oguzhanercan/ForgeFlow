"use client";

import {
  MessageSquare,
  FolderKanban,
  Play,
  Library,
  Cpu,
  Box,
  Settings,
} from "lucide-react";
import { useForgeFlowUiStore } from "../lib/store";
import type { SidebarPanel } from "./types";

type RailItem = {
  id: SidebarPanel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const railItems: RailItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "runs", label: "Runs", icon: Play },
  { id: "library", label: "Library", icon: Library },
  { id: "models", label: "Models", icon: Cpu },
  { id: "3d", label: "3D Assets", icon: Box },
  { id: "settings", label: "Settings", icon: Settings },
];

export function GlobalRail() {
  const activePanel = useForgeFlowUiStore((s) => s.activePanel);
  const setActivePanel = useForgeFlowUiStore((s) => s.setActivePanel);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[56px] flex-col items-center border-r border-white/[0.04] bg-[#0c0c0d] py-3">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#00d1ff] to-[#0088aa] text-xs font-black tracking-[0.2em] text-white shadow-[0_4px_12px_rgba(0,209,255,0.16)]">
        FF
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1">
        {railItems.map((item) => {
          const active = item.id === activePanel;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              title={item.label}
              aria-label={item.label}
              className={[
                "group relative flex h-10 w-10 items-center justify-center rounded-[14px] transition-all duration-200",
                active
                  ? "bg-[#0d2932] text-[#00d1ff]"
                  : "text-[#5a6368] hover:bg-[#161718] hover:text-[#a4e6ff]",
              ].join(" ")}
            >
              {active && (
                <span className="absolute inset-y-2 left-0 w-[2px] rounded-r-full bg-[#00d1ff]" />
              )}
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#0f1010] text-[10px] font-black uppercase tracking-[0.2em] text-[#5a6368]">
        12
      </div>
    </aside>
  );
}
