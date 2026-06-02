import type { Artifact, ChatMessageApi, Run } from "@forgeflow/contracts";

import { artifactDownloadUrl } from "./api";
import type { CanvasEdge, CanvasNode, RunStatus } from "../components/types";

const visualKinds = new Set(["raw_image", "prepared_image", "object3d"]);

export function mapRunStatus(status?: string | null): RunStatus {
  if (status === "failed") return "failed";
  if (status === "completed" || status === "accepted" || status === "generated" || status === "uploaded") return "completed";
  if (status === "queued" || status === "awaiting_review_mode") return "queued";
  if (status === "running" || status === "processing") return "running";
  return "idle";
}

export function mapArtifactToCanvasNode(artifact: Artifact, index: number, overrides?: Partial<Pick<CanvasNode, "type">> & { sourceArtifactId?: string }): CanvasNode {
  const hash = artifact.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const column = index % 3;
  const row = Math.floor(index / 3);
  const is3d = artifact.kind === "object3d";
  const isPrepared = artifact.kind === "prepared_image";

  return {
    id: artifact.id,
    type: overrides?.type ?? (is3d ? "three_d_preview" : isPrepared ? "background_removal" : "image_generation"),
    title: artifact.title,
    status: mapRunStatus(artifact.status),
    x: 120 + column * 340 + (hash % 32),
    y: 120 + row * 300 + ((hash * 3) % 32),
    previewUrl: is3d ? undefined : artifactDownloadUrl(artifact.id),
    assetUrl: artifactDownloadUrl(artifact.id, is3d ? "glb" : undefined),
    metadata: {
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      groupKey: artifact.group_key,
      stage: artifact.stage,
      createdAt: String(artifact.created_at),
      format: is3d ? "GLB" : undefined,
      model: typeof artifact.metadata?.model === "string" ? artifact.metadata.model : undefined,
      prompt: typeof artifact.metadata?.prompt === "string" ? artifact.metadata.prompt : undefined,
      sourceArtifactId: overrides?.sourceArtifactId ?? (typeof artifact.metadata?.source_artifact_id === "string" ? artifact.metadata.source_artifact_id : undefined),
      operation: typeof artifact.metadata?.operation === "string" ? artifact.metadata.operation : undefined,
    },
  };
}

export function buildCanvasNodes(artifacts: Artifact[]): CanvasNode[] {
  return artifacts
    .filter((artifact) => visualKinds.has(artifact.kind))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((artifact, index) => mapArtifactToCanvasNode(artifact, index));
}

function findPromptForRun(run: Run | undefined, messages: ChatMessageApi[]) {
  if (!run) return null;
  const runCreatedAt = new Date(run.created_at).getTime();
  return messages
    .filter((message) => message.role === "user" && new Date(message.created_at).getTime() <= runCreatedAt)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
}

function selectedAssetIdFromMessage(message: ChatMessageApi | null) {
  return typeof message?.metadata?.selected_asset_id === "string" ? message.metadata.selected_asset_id : null;
}

function commandModeFromMessage(message: ChatMessageApi | null) {
  return typeof message?.metadata?.command_mode === "string" ? message.metadata.command_mode : null;
}

function buildPromptNodes(messages: ChatMessageApi[], runs: Run[], artifacts: Artifact[]): CanvasNode[] {
  const visualArtifacts = artifacts.filter((artifact) => visualKinds.has(artifact.kind));
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const promptByMessageId = new Map<string, { message: ChatMessageApi; firstArtifactIndex: number }>();

  visualArtifacts.forEach((artifact, index) => {
    const prompt = findPromptForRun(runsById.get(artifact.run_id), messages);
    if (!prompt || promptByMessageId.has(prompt.id)) return;
    promptByMessageId.set(prompt.id, { message: prompt, firstArtifactIndex: index });
  });

  return Array.from(promptByMessageId.values())
    .sort((a, b) => new Date(a.message.created_at).getTime() - new Date(b.message.created_at).getTime())
    .map(({ message, firstArtifactIndex }, index) => {
      const column = firstArtifactIndex % 3;
      const row = Math.floor(firstArtifactIndex / 3);
      return {
        id: `prompt_${message.id}`,
        type: "prompt",
        title: `Prompt ${index + 1}`,
        status: "completed",
        x: 120 + column * 340,
        y: Math.max(24, 24 + row * 300),
        metadata: {
          prompt: message.content,
          createdAt: String(message.created_at),
        },
      };
    });
}

export function buildCanvasEdges(nodes: CanvasNode[], artifacts: Artifact[]): CanvasEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: CanvasEdge[] = [];

  for (const artifact of artifacts) {
    const sourceId = typeof artifact.metadata?.source_artifact_id === "string" ? artifact.metadata.source_artifact_id : null;
    if (!sourceId || !nodeIds.has(sourceId) || !nodeIds.has(artifact.id)) continue;
    edges.push({
      id: `edge_${sourceId}_${artifact.id}`,
      sourceNodeId: sourceId,
      targetNodeId: artifact.id,
      relation: artifact.kind === "object3d" ? "three_d_conversion" : artifact.metadata?.operation === "background_removal" ? "background_removal" : "edit",
    });
  }

  return edges;
}

function buildPromptEdges(nodes: CanvasNode[], artifacts: Artifact[], messages: ChatMessageApi[], runs: Run[]): CanvasEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const edges: CanvasEdge[] = [];

  for (const artifact of artifacts) {
    if (!visualKinds.has(artifact.kind)) continue;
    const prompt = findPromptForRun(runsById.get(artifact.run_id), messages);
    if (!prompt) continue;
    const promptNodeId = `prompt_${prompt.id}`;
    if (!nodeIds.has(promptNodeId) || !nodeIds.has(artifact.id)) continue;
    edges.push({
      id: `edge_${promptNodeId}_${artifact.id}`,
      sourceNodeId: promptNodeId,
      targetNodeId: artifact.id,
      relation: "generation",
    });
  }

  return edges;
}

export function buildCanvasGraph({
  artifacts,
  messages,
  runs,
}: {
  artifacts: Artifact[];
  messages: ChatMessageApi[];
  runs: Run[];
}): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const visualArtifacts = artifacts
    .filter((artifact) => visualKinds.has(artifact.kind))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const assetNodes = visualArtifacts.map((artifact, index) => {
    const prompt = findPromptForRun(runsById.get(artifact.run_id), messages);
    const selectedAssetId = selectedAssetIdFromMessage(prompt);
    const commandMode = commandModeFromMessage(prompt);
    const inferredSourceId = typeof artifact.metadata?.source_artifact_id === "string" ? undefined : selectedAssetId ?? undefined;
    const inferredType = artifact.kind === "raw_image" && (commandMode === "image_edit" || selectedAssetId) ? "image_edit" : undefined;
    return mapArtifactToCanvasNode(artifact, index, {
      sourceArtifactId: inferredSourceId,
      type: inferredType,
    });
  });
  const promptNodes = buildPromptNodes(messages, runs, artifacts);
  const nodes = [...promptNodes, ...assetNodes.map((node) => ({ ...node, y: node.y + (promptNodes.length > 0 ? 170 : 0) }))];
  const lineageEdges = buildCanvasEdges(nodes, visualArtifacts.map((artifact) => {
    const prompt = findPromptForRun(runsById.get(artifact.run_id), messages);
    const selectedAssetId = selectedAssetIdFromMessage(prompt);
    if (typeof artifact.metadata?.source_artifact_id === "string" || !selectedAssetId) return artifact;
    return {
      ...artifact,
      metadata: {
        ...(artifact.metadata ?? {}),
        source_artifact_id: selectedAssetId,
        operation: commandModeFromMessage(prompt) === "image_edit" ? "image_edit" : artifact.metadata?.operation,
      },
    };
  }));
  const promptEdges = buildPromptEdges(nodes, artifacts, messages, runs);
  return { nodes, edges: [...promptEdges, ...lineageEdges] };
}

export function latestRun(runs: Run[] = []) {
  return runs.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}
