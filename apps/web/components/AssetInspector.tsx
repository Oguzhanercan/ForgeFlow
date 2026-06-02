"use client";

import {
  X,
  Download,
  Scissors,
  Sparkles,
  Box,
  ZoomIn,
  Image as ImageIcon,
  ExternalLink,
  RotateCcw,
  Layers,
  Pencil,
} from "lucide-react";
import { useForgeFlowUiStore } from "../lib/store";
import type { CanvasNode } from "./types";

function EmptyInspectorState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/[0.04]">
        <ImageIcon className="h-7 w-7 text-[#2a2a2a]" />
      </div>
      <h3 className="font-headline text-[15px] font-semibold text-[#dff7ff]">No Asset Selected</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#5a6368]">
        Select a node on the canvas to view its details and available actions.
      </p>

      <div className="mt-8 w-full space-y-2 text-left">
        <div className="rounded-[10px] bg-white/[0.03] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-[#859399]">Recent Actions</div>
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-[#5a6368]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
              BG Removal completed
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#5a6368]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a78bfa]" />
              3D conversion in progress
            </div>
          </div>
        </div>

        <div className="rounded-[10px] bg-white/[0.03] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-[#859399]">Suggested Next Steps</div>
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-[#00d1ff]">Create a new prompt</div>
            <div className="flex items-center gap-2 text-[11px] text-[#5a6368]">Upload reference image</div>
            <div className="flex items-center gap-2 text-[11px] text-[#5a6368]">Browse templates</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageInspector({ node }: { node: CanvasNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.04] bg-[#0a0b0b]">
        {node.previewUrl ? (
          <img src={node.previewUrl} alt={node.title} className="w-full aspect-square object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center text-[#2a2a2a]">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {node.metadata?.prompt && (
          <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Prompt</div>
            <div className="text-[12px] leading-relaxed text-[#a0a5a9]">{node.metadata.prompt}</div>
          </div>
        )}

        {node.metadata?.negativePrompt && (
          <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Negative Prompt</div>
            <div className="text-[12px] leading-relaxed text-[#a0a5a9]">{node.metadata.negativePrompt}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {node.metadata?.model && (
            <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Model</div>
              <div className="mt-0.5 text-[12px] text-[#d2d0ce]">{node.metadata.model}</div>
            </div>
          )}
          {node.metadata?.seed != null && (
            <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Seed</div>
              <div className="mt-0.5 text-[12px] text-[#d2d0ce]">{node.metadata.seed}</div>
            </div>
          )}
          {node.metadata?.size && (
            <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Size</div>
              <div className="mt-0.5 text-[12px] text-[#d2d0ce]">{node.metadata.size}</div>
            </div>
          )}
          {node.metadata?.cost != null && (
            <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Cost</div>
              <div className="mt-0.5 text-[12px] text-[#4ade80]">${node.metadata.cost.toFixed(2)}</div>
            </div>
          )}
          {node.metadata?.createdAt && (
            <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Created</div>
              <div className="mt-0.5 text-[12px] text-[#d2d0ce]">
                {new Date(node.metadata.createdAt).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Actions</div>
        <div className="grid grid-cols-2 gap-1">
          <ActionBtn icon={Pencil} label="Edit Image" />
          <ActionBtn icon={Scissors} label="Remove BG" />
          <ActionBtn icon={Sparkles} label="Variations" />
          <ActionBtn icon={ZoomIn} label="Upscale" />
          <ActionBtn icon={Box} label="Convert to 3D" />
          <ActionBtn icon={Download} label="Download" />
          <ActionBtn icon={ExternalLink} label="Send to Library" />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-[8px] bg-white/[0.03] px-3 py-2 text-[11px] text-[#859399] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function ThreeDInspector({ node }: { node: CanvasNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[12px] border border-[#a78bfa]/10 bg-gradient-to-b from-[#10171a] to-[#080b0c]">
        <div className="flex aspect-square items-center justify-center">
          {node.previewUrl ? (
            <img src={node.previewUrl} alt={node.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Box className="h-12 w-12 text-[#2a2a2a]" />
              <span className="text-[11px] text-[#3a3a3a]">3D Viewport Placeholder</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {node.metadata?.format && (
          <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Format</div>
            <div className="mt-0.5 text-[12px] text-[#a78bfa]">{node.metadata.format}</div>
          </div>
        )}
        {node.metadata?.polycount != null && (
          <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Polycount</div>
            <div className="mt-0.5 text-[12px] text-[#d2d0ce]">{node.metadata.polycount.toLocaleString()}</div>
          </div>
        )}
        {node.metadata?.textureResolution && (
          <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Textures</div>
            <div className="mt-0.5 text-[12px] text-[#d2d0ce]">{node.metadata.textureResolution}</div>
          </div>
        )}
        {node.metadata?.model && (
          <div className="rounded-[10px] bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Gen Model</div>
            <div className="mt-0.5 text-[12px] text-[#d2d0ce]">{node.metadata.model}</div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5a6368]">Export</div>
        <div className="grid grid-cols-2 gap-1">
          <ActionBtn icon={Box} label="Open 3D Viewer" onClick={() => node.onOpen3D?.(node)} />
          <ActionBtn icon={Download} label="Download GLB" />
          <ActionBtn icon={Download} label="Download OBJ" />
          <ActionBtn icon={Download} label="Download FBX" />
          <ActionBtn icon={Download} label="Download USDZ" />
          <ActionBtn icon={RotateCcw} label="Regen Texture" />
          <ActionBtn icon={Layers} label="Simplify Mesh" />
        </div>
      </div>
    </div>
  );
}

const demoNode: CanvasNode = {
  id: "gen-1",
  type: "image_generation",
  title: "fallen_angel_v1.png",
  status: "completed",
  x: 0,
  y: 0,
  previewUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop",
  metadata: {
    model: "stable-diffusion-3",
    prompt: "A photorealistic fallen angel standing in the Garden of Eden at golden hour, dramatic lighting, detailed feathers, cinematic composition, 8K",
    negativePrompt: "blurry, distorted, deformed, low quality",
    seed: 4256789,
    size: "1024x1024",
    cost: 0.04,
    createdAt: "2026-05-05T10:30:15Z",
  },
};

type AssetInspectorProps = {
  nodes?: CanvasNode[];
  onOpen3D?: (node: CanvasNode) => void;
};

export function AssetInspector({ nodes, onOpen3D }: AssetInspectorProps) {
  const selectedNodeId = useForgeFlowUiStore((s) => s.selectedNodeId);
  const inspectorCollapsed = useForgeFlowUiStore((s) => s.inspectorCollapsed);
  const setInspectorCollapsed = useForgeFlowUiStore((s) => s.setInspectorCollapsed);

  const selectedNode = nodes?.find((node) => node.id === selectedNodeId) ?? demoNode;
  const is3D = selectedNode.type === "three_d_preview" || selectedNode.type === "image_to_3d";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3">
        <h2 className="font-headline text-[13px] font-semibold tracking-tight text-[#dff7ff]">
          {selectedNodeId ? "Inspector" : "Project Overview"}
        </h2>
        <button
          onClick={() => setInspectorCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#5a6368] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {selectedNodeId ? (
          is3D ? (
            <ThreeDInspector node={{ ...selectedNode, onOpen3D }} />
          ) : (
            <ImageInspector node={selectedNode} />
          )
        ) : (
          <EmptyInspectorState />
        )}
      </div>
    </div>
  );
}
