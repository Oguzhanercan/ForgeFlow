import type { Artifact, ProviderModel, SessionBundle } from "@forgeflow/contracts";

export type ProviderSummary = {
  planner: string;
  image: string;
  object3d: string;
};

const NOT_CONFIGURED = "Not configured";

export function resolveProviderSummary(
  providers: ProviderModel[],
  sessionMetadata?: Record<string, unknown>,
): ProviderSummary {
  const preferredProviders = asRecord(sessionMetadata?.preferred_providers);

  return {
    planner: resolveProviderLabel(providers, "planner_text", preferredProviders?.planner_text),
    image: resolveProviderLabel(providers, "image_generation", preferredProviders?.image_generation),
    object3d: resolveProviderLabel(providers, "object3d_generation", preferredProviders?.object3d_generation),
  };
}

export function resolveVisibleArtifacts(bundle?: SessionBundle | null): Artifact[] {
  return (bundle?.artifacts ?? [])
    .slice()
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

function resolveProviderLabel(
  providers: ProviderModel[],
  capability: string,
  preferredProviderId: unknown,
): string {
  const preferred =
    typeof preferredProviderId === "string"
      ? providers.find((provider) => provider.id === preferredProviderId && provider.status === "active")
      : null;
  if (preferred) {
    return preferred.label;
  }
  return (
    providers.find((provider) => provider.status === "active" && provider.capabilities.includes(capability))?.label ??
    NOT_CONFIGURED
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
