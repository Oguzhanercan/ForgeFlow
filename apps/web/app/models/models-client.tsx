"use client";

import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@forgeflow/ui";

import { fetchProviders, registerProvider, testProvider, updateProviderStatus } from "../../lib/api";
import { detectLocale, formatCapabilityLabel, formatRunStatusLabel, formatSourceKindLabel } from "../../lib/display";

type HealthRecord = {
  ok: boolean;
  detail: string;
};

function pickDefault(providers: ReturnType<typeof Array.prototype.filter>, capability: string) {
  return providers.find((provider) => provider.capabilities.includes(capability) && provider.status === "active")?.label ?? "Not configured";
}

export function ModelsClient() {
  const locale = detectLocale();
  const queryClient = useQueryClient();
  const [modelRef, setModelRef] = useState("");
  const [providerKind, setProviderKind] = useState("huggingface");
  const [healthByProvider, setHealthByProvider] = useState<Record<string, HealthRecord>>({});
  const query = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });

  const registerMutation = useMutation({
    mutationFn: () => registerProvider(modelRef, providerKind),
    onSuccess: async () => {
      setModelRef("");
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: ({ providerId, capability }: { providerId: string; capability?: string }) => testProvider(providerId, capability),
    onSuccess: (result, variables) => {
      setHealthByProvider((current) => ({
        ...current,
        [variables.providerId]: { ok: result.ok, detail: result.detail },
      }));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ providerId, status }: { providerId: string; status: "active" | "disabled" }) =>
      updateProviderStatus(providerId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  const providers = query.data ?? [];
  const runtimeSummary = useMemo(
    () => ({
      planner: pickDefault(providers, "planner_text"),
      image: pickDefault(providers, "image_generation"),
      object3d: pickDefault(providers, "object3d_generation"),
    }),
    [providers],
  );

  return (
    <AppShell activeNav="Models" title="ForgeFlow" subtitle="Models & Providers" statusPill={locale === "tr" ? "Registry Hazır" : "Registry Ready"}>
      <main className="flex-1 rounded-[30px] bg-[#121314]/94 px-4 py-4 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mb-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[24px] bg-[#181a1b] p-6">
            <div className="font-headline text-3xl font-black tracking-tight">Model Foundry</div>
            <div className="mt-2 text-sm text-[#859399]">
              Register local Hugging Face paths, NVIDIA Build models, or OpenRouter adapters without restarting the app.
            </div>
            <div className="mt-5 grid gap-3">
              <input
                className="rounded-[18px] border border-white/5 bg-[#101112] px-4 py-3 text-sm outline-none"
                onChange={(event) => setModelRef(event.target.value)}
                placeholder="Model path, Hugging Face URL, NVIDIA model ID, or OpenRouter model"
                value={modelRef}
              />
              <select
                className="rounded-[18px] border border-white/5 bg-[#101112] px-4 py-3 text-sm outline-none"
                onChange={(event) => setProviderKind(event.target.value)}
                value={providerKind}
              >
                <option value="huggingface">Hugging Face / Local</option>
                <option value="nvidia">NVIDIA Build</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <button
                className="rounded-lg bg-gradient-to-br from-[#a4e6ff] to-[#00d1ff] px-5 py-3 text-sm font-bold text-[#003543] disabled:opacity-50"
                disabled={registerMutation.isPending || modelRef.trim().length === 0}
                onClick={() => registerMutation.mutate()}
                type="button"
              >
                {registerMutation.isPending ? "Registering..." : "Add Model"}
              </button>
              {registerMutation.isError ? (
                <div className="rounded-2xl bg-[#321918] px-4 py-3 text-sm text-[#ffb3a4]">
                  {registerMutation.error instanceof Error ? registerMutation.error.message : "Provider registration failed."}
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-[24px] bg-[#181a1b] p-6">
            <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Default Runtime</div>
            <div className="mt-4 space-y-2 text-sm">
              <div>Planner/VLM: {runtimeSummary.planner}</div>
              <div>Image: {runtimeSummary.image}</div>
              <div>3D: {runtimeSummary.object3d}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => {
            const health = healthByProvider[provider.id];
            const isDisabled = provider.status === "disabled";
            return (
              <div key={provider.id} className={`rounded-[24px] bg-[#181a1b] p-5 ${isDisabled ? "opacity-65" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold">{provider.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">
                      {formatSourceKindLabel(provider.source_kind ?? provider.sourceKind, locale)}
                    </div>
                    <div className="mt-2 break-all text-xs text-[#859399]">{provider.normalized_id}</div>
                  </div>
                  <div className="rounded-full bg-[#2a2a2a] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#a4e6ff]">
                    {formatRunStatusLabel(provider.status, locale)}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {provider.capabilities.map((capability) => (
                    <span key={capability} className="rounded-full bg-[#232526] px-3 py-1 text-xs text-[#e5e2e1]">
                      {formatCapabilityLabel(capability, locale)}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full bg-[#131313] px-3 py-2 text-xs font-semibold text-[#a4e6ff] disabled:opacity-50"
                    onClick={() =>
                      testMutation.mutate({
                        providerId: provider.id,
                        capability: provider.capabilities[0],
                      })
                    }
                    type="button"
                  >
                    {testMutation.isPending && testMutation.variables?.providerId === provider.id ? "Testing..." : "Test"}
                  </button>
                  {provider.status === "needs_override" ? (
                    <span className="text-xs text-[#859399]">
                      {locale === "tr" ? "Capability override gerekiyor." : "Capability override required."}
                    </span>
                  ) : (
                    <button
                      className="rounded-full bg-[#131313] px-3 py-2 text-xs font-semibold text-[#dff7ff] disabled:opacity-50"
                      disabled={statusMutation.isPending && statusMutation.variables?.providerId === provider.id}
                      onClick={() =>
                        statusMutation.mutate({
                          providerId: provider.id,
                          status: isDisabled ? "active" : "disabled",
                        })
                      }
                      type="button"
                    >
                      {statusMutation.isPending && statusMutation.variables?.providerId === provider.id
                        ? "Updating..."
                        : isDisabled
                          ? "Enable"
                          : "Disable"}
                    </button>
                  )}
                  {health ? (
                    <span
                      className={`rounded-full px-3 py-2 text-xs font-semibold ${health.ok ? "bg-[#0d2932] text-[#a4e6ff]" : "bg-[#321918] text-[#ffb3a4]"}`}
                    >
                      {health.ok ? "Healthy" : "Unhealthy"} · {health.detail}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
