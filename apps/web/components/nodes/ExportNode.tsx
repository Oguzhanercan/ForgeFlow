"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Download } from "lucide-react";
import type { CanvasNode } from "../types";

function ExportNodeComponent({ data }: { data: CanvasNode }) {
  return (
    <div className="min-w-[200px] rounded-[14px] border border-white/[0.05] bg-[#131415]/95 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <Handle type="target" position={Position.Top} className="!bg-[#5a6368] !h-3 !w-3 !border-2 !border-[#131415]" />

      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#0e2313]">
          <Download className="h-3 w-3 text-[#4ade80]" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4ade80]">Export</span>
      </div>

      <div className="px-3 py-2.5">
        <div className="truncate text-[12px] font-medium text-[#d2d0ce]">{data.title}</div>
        <div className="mt-0.5 text-[10px] text-[#5a6368]">
          {data.metadata?.format ?? "Ready to export"}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-white/[0.04] px-1.5 py-1.5">
        <button className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#a4e6ff] transition hover:bg-white/[0.06]">Download</button>
        <button className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">Copy</button>
      </div>
    </div>
  );
}

export const ExportNode = memo(ExportNodeComponent);
