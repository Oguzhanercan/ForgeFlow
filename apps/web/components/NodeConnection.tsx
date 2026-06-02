"use client";

import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { EdgeRelation } from "./types";

const relationConfig: Record<EdgeRelation, { stroke: string; dash?: string; label: string }> = {
  generation: { stroke: "#00d1ff", label: "generates" },
  edit: { stroke: "#a3d44e", dash: "8 4", label: "edits" },
  background_removal: { stroke: "#4ade80", dash: "6 4", label: "removes bg" },
  upscale: { stroke: "#818cf8", dash: "6 4", label: "upscales" },
  three_d_conversion: { stroke: "#a78bfa", label: "converts to 3D" },
  reference: { stroke: "#5a6368", dash: "4 6", label: "references" },
};

type NodeConnectionData = {
  relation: EdgeRelation;
};

function NodeConnectionComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps & { data?: NodeConnectionData }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const config = relationConfig[data?.relation ?? "generation"];

  return (
    <>
      <BaseEdge
        path={edgePath}
        className={selected ? "!opacity-100" : "!opacity-35"}
        style={{
          stroke: config.stroke,
          strokeWidth: 2,
          strokeDasharray: config.dash,
        }}
      />
      {selected && (
        <foreignObject
          x={labelX - 40}
          y={labelY - 10}
          width={80}
          height={20}
          className="overflow-visible"
        >
          <div className="flex items-center justify-center">
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-medium backdrop-blur-md"
              style={{
                backgroundColor: `${config.stroke}15`,
                color: config.stroke,
                border: `1px solid ${config.stroke}30`,
              }}
            >
              {config.label}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}

export const NodeConnection = memo(NodeConnectionComponent);
