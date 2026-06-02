import { describe, expect, test } from "vitest";
import type { ModelCatalogEntry, ProviderModel } from "@forgeflow/contracts";

import {
  buildModelMetadata,
  capabilityForComposerMode,
  filterModelsForMode,
  mergeModelOptions,
} from "./model-registry";

const catalog: ModelCatalogEntry[] = [
  {
    id: "catalog_flux2_4b",
    label: "FLUX.2 klein 4B",
    normalized_id: "black-forest-labs/FLUX.2-klein-4B",
    source_kind: "local_hf_diffusers",
    capabilities: ["image_generation", "image_editing"],
    status: "recommended",
    metadata: { runtime_options: ["local_hf_diffusers", "api"], quantization: "nf4" },
  },
  {
    id: "catalog_qwen3",
    label: "Qwen3 32B",
    normalized_id: "Qwen/Qwen3-32B-Instruct",
    source_kind: "local_hf_transformers",
    capabilities: ["planner_text", "text_chat"],
    status: "recommended",
    metadata: { quantization: "nf4" },
  },
];

const providers: ProviderModel[] = [
  {
    id: "provider_flux2",
    label: "Local FLUX.2",
    normalized_id: "black-forest-labs/FLUX.2-klein-4B",
    source_kind: "local_hf_diffusers",
    capabilities: ["image_generation", "image_editing"],
    status: "active",
    metadata: { registration_kind: "huggingface" },
  },
];

describe("model registry helpers", () => {
  test("maps composer modes to execution capabilities", () => {
    expect(capabilityForComposerMode("text_to_image")).toBe("image_generation");
    expect(capabilityForComposerMode("image_edit")).toBe("image_editing");
    expect(capabilityForComposerMode("workflow")).toBe("planner_text");
  });

  test("filters merged registered and catalog models by composer mode", () => {
    const options = mergeModelOptions({ catalog, providers });

    expect(filterModelsForMode(options, "text_to_image").map((option) => option.id)).toEqual([
      "provider_flux2",
      "catalog_flux2_4b",
    ]);
    expect(filterModelsForMode(options, "workflow").map((option) => option.id)).toEqual([
      "catalog_qwen3",
    ]);
  });

  test("builds prompt metadata from selected model option", () => {
    const option = mergeModelOptions({ catalog, providers })[0];

    expect(buildModelMetadata(option, "image_edit")).toEqual({
      selected_provider_id: "provider_flux2",
      selected_model_ref: "black-forest-labs/FLUX.2-klein-4B",
      selected_model_label: "Local FLUX.2",
      selected_model_source: "local_hf_diffusers",
      selected_model_capability: "image_editing",
    });
  });
});
