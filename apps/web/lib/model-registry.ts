import type { ModelCatalogEntry, ProviderModel } from "@forgeflow/contracts";
import type { ComposerMode } from "../components/types";

export type ModelOption = {
  id: string;
  label: string;
  normalizedId: string;
  sourceKind: string;
  capabilities: string[];
  status: string;
  origin: "provider" | "catalog";
  metadata: Record<string, unknown>;
};

export function capabilityForComposerMode(mode: ComposerMode) {
  if (mode === "text_to_image") return "image_generation";
  if (mode === "image_edit") return "image_editing";
  if (mode === "background_removal") return "background_removal";
  if (mode === "image_to_3d") return "object3d_generation";
  if (mode === "upscale") return "upscale";
  return "planner_text";
}

function optionFromProvider(provider: ProviderModel): ModelOption {
  return {
    id: provider.id,
    label: provider.label,
    normalizedId: provider.normalized_id ?? provider.id,
    sourceKind: provider.source_kind ?? provider.sourceKind ?? "unknown",
    capabilities: provider.capabilities,
    status: provider.status,
    origin: "provider",
    metadata: provider.metadata ?? {},
  };
}

function optionFromCatalog(entry: ModelCatalogEntry): ModelOption {
  return {
    id: entry.id,
    label: entry.label,
    normalizedId: entry.normalized_id,
    sourceKind: entry.source_kind,
    capabilities: entry.capabilities,
    status: entry.status,
    origin: "catalog",
    metadata: entry.metadata ?? {},
  };
}

export function mergeModelOptions({
  catalog,
  providers,
}: {
  catalog: ModelCatalogEntry[];
  providers: ProviderModel[];
}) {
  return [
    ...providers.map(optionFromProvider),
    ...catalog.map(optionFromCatalog),
  ];
}

export function filterModelsForMode(options: ModelOption[], mode: ComposerMode) {
  const capability = capabilityForComposerMode(mode);
  return options.filter((option) => option.capabilities.includes(capability));
}

export function buildModelMetadata(option: ModelOption | null | undefined, mode: ComposerMode) {
  if (!option) return {};
  const capability = capabilityForComposerMode(mode);
  return {
    selected_provider_id: option.origin === "provider" ? option.id : undefined,
    selected_model_ref: option.normalizedId,
    selected_model_label: option.label,
    selected_model_source: option.sourceKind,
    selected_model_capability: capability,
  };
}
