"use client";

import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import { Box, RotateCcw } from "lucide-react";
import type { CanvasNode } from "../types";
import { useForgeFlowUiStore } from "../../lib/store";

function ThreeDPreviewNodeComponent({ data }: { data: CanvasNode }) {
  const setSelectedNodeId = useForgeFlowUiStore((s) => s.setSelectedNodeId);

  const handleView3D = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(data.id);
    data.onOpen3D?.(data);
  }, [data, setSelectedNodeId]);

  const handleDownload = useCallback((e: React.MouseEvent, format: string) => {
    e.stopPropagation();
    setSelectedNodeId(data.id);
  }, [data.id, setSelectedNodeId]);
  return (
    <div className="w-[260px] rounded-[14px] border border-[#a78bfa]/10 bg-[#131415]/95 shadow-[0_8px_32px_rgba(167,139,250,0.06)] backdrop-blur-xl">
      <Handle type="target" position={Position.Top} className="!bg-[#a78bfa] !h-3 !w-3 !border-2 !border-[#131415]" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#a78bfa] !h-3 !w-3 !border-2 !border-[#131415]" />

      <button
        type="button"
        onClick={handleView3D}
        aria-label={`Open 3D viewer for ${data.title}`}
        className="block w-full rounded-t-[14px] text-left transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a78bfa]"
      >
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#1a1228]">
            <Box className="h-3 w-3 text-[#a78bfa]" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a78bfa]">3D Preview</span>
        </div>

        <div className="relative aspect-square overflow-hidden bg-gradient-to-b from-[#10171a] to-[#080b0c]">
          {data.previewUrl ? (
            <img src={data.previewUrl} alt={data.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[#2a2a2a]">
              <Box className="h-12 w-12" />
              <span className="text-[10px] text-[#3a3a3a]">3D Viewport</span>
            </div>
          )}
          <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-[8px] bg-black/40 text-[#a78bfa]">
            <RotateCcw className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="truncate text-[12px] font-medium text-[#d2d0ce]">{data.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#5a6368]">
            {data.metadata?.format && <span>{data.metadata.format}</span>}
            {data.metadata?.polycount && (
              <>
                <span className="text-white/[0.1]">·</span>
                <span>{data.metadata.polycount.toLocaleString()} polys</span>
              </>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 border-t border-white/[0.04] px-1.5 py-1.5">
        <button type="button" onClick={handleView3D} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#a4e6ff] transition hover:bg-white/[0.06]">View 3D</button>
        <button onClick={(e) => handleDownload(e, "GLB")} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">GLB</button>
        <button onClick={(e) => handleDownload(e, "FBX")} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">FBX</button>
      </div>
    </div>
  );
}

export const ThreeDPreviewNode = memo(ThreeDPreviewNodeComponent);
