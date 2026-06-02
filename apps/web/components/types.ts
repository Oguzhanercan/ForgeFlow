export type NodeType =
  | "prompt"
  | "image_generation"
  | "image_edit"
  | "background_removal"
  | "upscale"
  | "image_to_3d"
  | "three_d_preview"
  | "export";

export type RunStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs_review";

export type CanvasNode = {
  id: string;
  type: NodeType;
  title: string;
  status: RunStatus;
  x: number;
  y: number;
  width?: number;
  height?: number;
  previewUrl?: string;
  assetUrl?: string;
  metadata?: {
    artifactId?: string;
    artifactKind?: string;
    groupKey?: string;
    stage?: string;
    sourceArtifactId?: string;
    operation?: string;
    model?: string;
    prompt?: string;
    negativePrompt?: string;
    seed?: number;
    size?: string;
    cost?: number;
    createdAt?: string;
    format?: string;
    polycount?: number;
    textureResolution?: string;
  };
  onOpen3D?: (node: CanvasNode) => void;
};

export type CanvasNodeAction =
  | "edit"
  | "generate_3d"
  | "remove_background"
  | "use_as_reference"
  | "view_3d";

export type EdgeRelation =
  | "generation"
  | "edit"
  | "background_removal"
  | "upscale"
  | "three_d_conversion"
  | "reference";

export type CanvasEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: EdgeRelation;
};

export type WorkspaceCard = {
  id: string;
  title: string;
  assetCount: number;
  runCount: number;
  updatedAt: string;
  status?: RunStatus;
};

export type ComposerMode =
  | "text_to_image"
  | "image_edit"
  | "background_removal"
  | "image_to_3d"
  | "upscale"
  | "workflow";

export type CommandModelSelection = {
  selected_provider_id?: string;
  selected_model_ref?: string;
  selected_model_label?: string;
  selected_model_source?: string;
  selected_model_capability?: string;
};

export type SidebarTab = "recent" | "projects" | "templates" | "assets";
export type SidebarPanel = "chat" | "projects" | "runs" | "library" | "models" | "3d" | "settings";
