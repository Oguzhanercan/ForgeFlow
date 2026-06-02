"use client";

import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import type { CanvasNode } from "../types";
import { RunStatusBadge } from "../RunStatusBadge";
import { useForgeFlowUiStore } from "../../lib/store";

function ImageGenerationNodeComponent({ data }: { data: CanvasNode }) {
  const setSelectedNodeId = useForgeFlowUiStore((s) => s.setSelectedNodeId);
  const setRunStatus = useForgeFlowUiStore((s) => s.setRunStatus);
  const setCommandMode = useForgeFlowUiStore((s) => s.setCommandMode);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(data.id);
    setRunStatus(data.status);
  }, [data.id, data.status, setSelectedNodeId, setRunStatus]);

  const handleRemix = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(data.id);
    setCommandMode("image_edit");
  }, [data.id, setSelectedNodeId, setCommandMode]);

  const handleRef = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(data.id);
  }, [data.id, setSelectedNodeId]);

  return (
    <div className="w-[240px] rounded-[14px] border border-white/[0.05] bg-[#131415]/95 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-shadow hover:shadow-[0_8px_32px_rgba(0,209,255,0.08)]">
      <Handle type="target" position={Position.Top} className="!bg-[#5a6368] !h-3 !w-3 !border-2 !border-[#131415]" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#5a6368] !h-3 !w-3 !border-2 !border-[#131415]" />

      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#0d2932]">
          <Sparkles className="h-3 w-3 text-[#00d1ff]" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#00d1ff]">Image Gen</span>
        <div className="ml-auto">
          <RunStatusBadge status={data.status} />
        </div>
      </div>

      <div className="relative aspect-square overflow-hidden bg-[#0a0b0b]">
        {data.previewUrl ? (
          <img
            src={data.previewUrl}
            alt={data.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[#2a2a2a]">
            <Sparkles className="h-8 w-8" />
          </div>
        )}
        {data.status === "running" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-1">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
          </div>
        )}
        {data.status === "failed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-[11px] font-semibold text-[#f87171]">Generation Failed</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="truncate text-[12px] font-medium text-[#d2d0ce]">{data.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#5a6368]">
          {data.metadata?.model && <span>{data.metadata.model}</span>}
          {data.metadata?.size && (
            <>
              <span className="text-white/[0.1]">·</span>
              <span>{data.metadata.size}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-white/[0.04] px-1.5 py-1.5">
        <button onClick={handleOpen} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#a4e6ff] transition hover:bg-white/[0.06]">Open</button>
        <button onClick={handleRemix} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">Remix</button>
        <button onClick={handleRef} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">Ref</button>
      </div>
    </div>
  );
}

export const ImageGenerationNode = memo(ImageGenerationNodeComponent);
