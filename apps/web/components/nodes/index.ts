export { PromptNode } from "./PromptNode";
export { ImageGenerationNode } from "./ImageGenerationNode";
export { ImageEditNode } from "./ImageEditNode";
export { BackgroundRemovalNode } from "./BackgroundRemovalNode";
export { UpscaleNode } from "./UpscaleNode";
export { ImageTo3DNode } from "./ImageTo3DNode";
export { ThreeDPreviewNode } from "./ThreeDPreviewNode";
export { ExportNode } from "./ExportNode";

import { PromptNode } from "./PromptNode";
import { ImageGenerationNode } from "./ImageGenerationNode";
import { ImageEditNode } from "./ImageEditNode";
import { BackgroundRemovalNode } from "./BackgroundRemovalNode";
import { UpscaleNode } from "./UpscaleNode";
import { ImageTo3DNode } from "./ImageTo3DNode";
import { ThreeDPreviewNode } from "./ThreeDPreviewNode";
import { ExportNode } from "./ExportNode";

export const nodeTypes = {
  prompt: PromptNode,
  image_generation: ImageGenerationNode,
  image_edit: ImageEditNode,
  background_removal: BackgroundRemovalNode,
  upscale: UpscaleNode,
  image_to_3d: ImageTo3DNode,
  three_d_preview: ThreeDPreviewNode,
  export: ExportNode,
};
