"use client";

import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import { Box } from "lucide-react";
import type { CanvasNode } from "../types";
import { RunStatusBadge } from "../RunStatusBadge";

function ImageTo3DNodeComponent({ data }: { data: CanvasNode }) {
  const handleView3D = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    data.onOpen3D?.(data);
  }, [data]);

  return (
    <div className="w-[240px] rounded-[14px] border border-white/[0.05] bg-[#131415]/95 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <Handle type="target" position={Position.Top} className="!bg-[#5a6368] !h-3 !w-3 !border-2 !border-[#131415]" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#5a6368] !h-3 !w-3 !border-2 !border-[#131415]" />

      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#1a1228]">
          <Box className="h-3 w-3 text-[#a78bfa]" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a78bfa]">Image to 3D</span>
        <div className="ml-auto">
          <RunStatusBadge status={data.status} />
        </div>
      </div>

      <div className="relative aspect-square overflow-hidden bg-gradient-to-b from-[#10171a] to-[#080b0c]">
        {data.previewUrl ? (
          <img src={data.previewUrl} alt={data.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[#2a2a2a]">
            <Box className="h-10 w-10" />
          </div>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="truncate text-[12px] font-medium text-[#d2d0ce]">{data.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#5a6368]">
          {data.metadata?.polycount && <span>{data.metadata.polycount.toLocaleString()} polys</span>}
          {data.metadata?.format && (
            <>
              <span className="text-white/[0.1]">·</span>
              <span>{data.metadata.format}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-white/[0.04] px-1.5 py-1.5">
        <button onClick={handleView3D} className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#a4e6ff] transition hover:bg-white/[0.06]">View 3D</button>
        <button className="rounded-[8px] px-2.5 py-1 text-[10px] font-medium text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">Download</button>
      </div>
    </div>
  );
}

export const ImageTo3DNode = memo(ImageTo3DNodeComponent);
