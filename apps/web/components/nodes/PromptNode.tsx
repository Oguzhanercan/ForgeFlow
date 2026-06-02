"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import type { CanvasNode } from "../types";

function PromptNodeComponent({ data }: { data: CanvasNode }) {
  return (
    <div className="min-w-[220px] rounded-[14px] border border-white/[0.05] bg-[#131415]/95 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <Handle type="source" position={Position.Bottom} className="!bg-[#00d1ff] !h-3 !w-3 !border-2 !border-[#131415]" />

      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#0d2932]">
          <MessageSquare className="h-3 w-3 text-[#00d1ff]" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#00d1ff]">Prompt</span>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-[12px] leading-relaxed text-[#a0a5a9] line-clamp-3">
          {data.metadata?.prompt ?? "No prompt text"}
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.04] px-3 py-1.5 text-[10px] text-[#5a6368]">
        <span className="truncate">{data.title}</span>
      </div>
    </div>
  );
}

export const PromptNode = memo(PromptNodeComponent);
