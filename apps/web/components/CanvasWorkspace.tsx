"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useForgeFlowUiStore } from "../lib/store";
import { nodeTypes } from "./nodes";
import { NodeConnection } from "./NodeConnection";
import type { CanvasNode as CanvasNodeType, CanvasEdge, CanvasNodeAction } from "./types";

const edgeTypes = {
  default: NodeConnection,
};

const demoNodes: Node<CanvasNodeType>[] = [
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 300, y: 50 },
    data: {
      id: "prompt-1",
      type: "prompt",
      title: "Fallen Angel in the Garden of Eden",
      status: "completed",
      x: 300,
      y: 50,
      metadata: {
        prompt: "A photorealistic fallen angel standing in the Garden of Eden at golden hour, dramatic lighting, detailed feathers, cinematic composition, 8K",
        model: "stable-diffusion-3",
        size: "1024x1024",
        cost: 0.04,
        createdAt: "2026-05-05T10:30:00Z",
        seed: 4256789,
      },
    },
  },
  {
    id: "gen-1",
    type: "image_generation",
    position: { x: 250, y: 280 },
    data: {
      id: "gen-1",
      type: "image_generation",
      title: "fallen_angel_v1.png",
      status: "completed",
      x: 250,
      y: 280,
      previewUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop",
      assetUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024&fit=crop",
      metadata: {
        model: "stable-diffusion-3",
        prompt: "A photorealistic fallen angel standing in the Garden of Eden at golden hour...",
        negativePrompt: "blurry, distorted, deformed",
        seed: 4256789,
        size: "1024x1024",
        cost: 0.04,
        createdAt: "2026-05-05T10:30:15Z",
      },
    },
  },
  {
    id: "edit-1",
    type: "image_edit",
    position: { x: 50, y: 520 },
    data: {
      id: "edit-1",
      type: "image_edit",
      title: "fallen_angel_edit_v1.png",
      status: "completed",
      x: 50,
      y: 520,
      previewUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop",
      metadata: {
        model: "stable-diffusion-3",
        size: "1024x1024",
        cost: 0.03,
        createdAt: "2026-05-05T10:32:00Z",
      },
    },
  },
  {
    id: "bgremove-1",
    type: "background_removal",
    position: { x: 450, y: 520 },
    data: {
      id: "bgremove-1",
      type: "background_removal",
      title: "fallen_angel_nobg.png",
      status: "completed",
      x: 450,
      y: 520,
      previewUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&h=400&fit=crop",
      metadata: {
        size: "1024x1024",
        cost: 0.01,
        createdAt: "2026-05-05T10:33:00Z",
      },
    },
  },
  {
    id: "3d-1",
    type: "image_to_3d",
    position: { x: 250, y: 760 },
    data: {
      id: "3d-1",
      type: "image_to_3d",
      title: "fallen_angel_3d.glb",
      status: "running",
      x: 250,
      y: 760,
      previewUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=400&fit=crop",
      metadata: {
        model: "meshy-4",
        polycount: 12500,
        textureResolution: "2048x2048",
        format: "GLB",
        cost: 0.15,
        createdAt: "2026-05-05T10:34:00Z",
      },
    },
  },
  {
    id: "3d-preview-1",
    type: "three_d_preview",
    position: { x: 550, y: 760 },
    data: {
      id: "3d-preview-1",
      type: "three_d_preview",
      title: "fallen_angel_3d_preview",
      status: "completed",
      x: 550,
      y: 760,
      metadata: {
        format: "GLB",
        polycount: 12500,
        textureResolution: "2048x2048",
        model: "meshy-4",
      },
    },
  },
];

const demoEdges: Edge<{ relation: CanvasEdge["relation"] }>[] = [
  { id: "e-prompt-gen1", source: "prompt-1", target: "gen-1", data: { relation: "generation" } },
  { id: "e-gen1-edit1", source: "gen-1", target: "edit-1", data: { relation: "edit" } },
  { id: "e-gen1-bgremove1", source: "gen-1", target: "bgremove-1", data: { relation: "background_removal" } },
  { id: "e-gen1-3d1", source: "gen-1", target: "3d-1", data: { relation: "three_d_conversion" } },
  { id: "e-3d1-3dpreview1", source: "3d-1", target: "3d-preview-1", data: { relation: "generation" } },
];

type CanvasWorkspaceProps = {
  nodes?: CanvasNodeType[];
  edges?: CanvasEdge[];
  onOpen3D?: (node: CanvasNodeType) => void;
  onNodeAction?: (action: CanvasNodeAction, node: CanvasNodeType) => void;
};

export function CanvasWorkspace({ edges: workspaceEdges, nodes: workspaceNodes, onNodeAction, onOpen3D }: CanvasWorkspaceProps) {
  const setSelectedNodeId = useForgeFlowUiStore((s) => s.setSelectedNodeId);
  const setRunStatus = useForgeFlowUiStore((s) => s.setRunStatus);
  const [contextMenu, setContextMenu] = useState<{ node: CanvasNodeType; x: number; y: number } | null>(null);

  const initialNodes = useMemo(() => (workspaceNodes ?? demoNodes.map((node) => node.data as CanvasNodeType)), [workspaceNodes]);
  const initialEdges = useMemo(() => (workspaceEdges ?? demoEdges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    relation: edge.data?.relation ?? "generation",
  } as CanvasEdge))), [workspaceEdges]);

  const flowNodes = useMemo<Node<CanvasNodeType>[]>(
    () => initialNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      data: { ...node, onOpen3D },
    })),
    [initialNodes, onOpen3D],
  );
  const flowEdges = useMemo<Edge<{ relation: CanvasEdge["relation"] }>[]>(
    () => initialEdges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      data: { relation: edge.relation },
    })),
    [initialEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges as any);

  useEffect(() => {
    setNodes(flowNodes as any);
    setEdges(flowEdges as any);
  }, [flowEdges, flowNodes, setEdges, setNodes]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      const n = initialNodes.find((d) => d.id === node.id);
      if (n) setRunStatus(n.status);
      setContextMenu(null);
    },
    [initialNodes, setSelectedNodeId, setRunStatus]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setRunStatus("idle");
    setContextMenu(null);
  }, [setSelectedNodeId, setRunStatus]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    const data = node.data as CanvasNodeType;
    setSelectedNodeId(node.id);
    setRunStatus(data.status);
    setContextMenu({ node: data, x: event.clientX, y: event.clientY });
  }, [setRunStatus, setSelectedNodeId]);

  const invokeAction = useCallback((action: CanvasNodeAction) => {
    if (!contextMenu) return;
    onNodeAction?.(action, contextMenu.node);
    setContextMenu(null);
  }, [contextMenu, onNodeAction]);

  const minimapNodeColor = useCallback((node: Node) => {
    const type = (node.data as CanvasNodeType)?.type;
    switch (type) {
      case "prompt": return "#00d1ff";
      case "image_generation": return "#00d1ff";
      case "image_edit": return "#a3d44e";
      case "background_removal": return "#4ade80";
      case "upscale": return "#818cf8";
      case "image_to_3d": return "#a78bfa";
      case "three_d_preview": return "#a78bfa";
      case "export": return "#4ade80";
      default: return "#5a6368";
    }
  }, []);

  return (
    <div className="flow-canvas h-full w-full">
      {initialNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-[18px] border border-white/[0.06] bg-[#111314]/90 px-6 py-5 text-center shadow-[0_18px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="font-headline text-sm font-semibold text-[#dff7ff]">Start with a prompt</div>
            <div className="mt-1 text-xs text-[#5a6368]">Every generation will appear here as a connected asset node.</div>
          </div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes as any}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
          className="bg-transparent"
      >
        <Background
          gap={32}
          size={1}
          color="rgba(255,255,255,0.025)"
        />
        <Controls
          className="!rounded-[12px] !border !border-white/[0.06] !bg-[#131415]/95 !shadow-[0_8px_32px_rgba(0,0,0,0.35)] !overflow-hidden"
          position="bottom-right"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0,0,0,0.7)"
          style={{ background: "#131415" }}
          className="!rounded-[12px] !border !border-white/[0.06] !shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
          position="bottom-left"
          pannable
          zoomable
        />
      </ReactFlow>
      {contextMenu && (
        <div
          className="fixed z-[80] w-56 overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#151718]/95 p-1.5 shadow-[0_24px_90px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          onContextMenu={(event) => event.preventDefault()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.node.type === "three_d_preview" && (
            <button className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12px] text-[#dff7ff] transition hover:bg-white/[0.06]" onClick={() => invokeAction("view_3d")} type="button">
              View 3D
            </button>
          )}
          <button className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12px] text-[#dff7ff] transition hover:bg-white/[0.06]" onClick={() => invokeAction("edit")} type="button">
            Edit Image
          </button>
          <button className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12px] text-[#dff7ff] transition hover:bg-white/[0.06]" onClick={() => invokeAction("generate_3d")} type="button">
            Generate 3D
          </button>
          <button className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12px] text-[#dff7ff] transition hover:bg-white/[0.06]" onClick={() => invokeAction("remove_background")} type="button">
            Remove Background
          </button>
          <div className="my-1 h-px bg-white/[0.06]" />
          <button className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12px] text-[#a4e6ff] transition hover:bg-white/[0.06]" onClick={() => invokeAction("use_as_reference")} type="button">
            Use as Reference
          </button>
        </div>
      )}
    </div>
  );
}
