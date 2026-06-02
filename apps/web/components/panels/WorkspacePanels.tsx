"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type { Artifact, ModelCatalogEntry, ProviderModel, Run, SessionSummary } from "@forgeflow/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu, FolderKanban, Image, Play, Settings, Box, Library, CheckCircle2, AlertTriangle } from "lucide-react";

import { artifactDownloadUrl, registerProvider, testProvider, updateProviderStatus } from "../../lib/api";
import { buildArtifactStats, buildProjectIndex } from "../../lib/dashboard";
import { formatShortId } from "../../lib/display";

function PanelFrame({ children, kicker, title }: { children: ReactNode; kicker: string; title: string }) {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#0c0c0d]">
      <div className="border-b border-white/[0.04] px-5 py-4">
        <div className="text-[11px] font-semibold text-[#5e747c]">{kicker}</div>
        <h2 className="mt-1 font-headline text-xl font-bold text-[#dff7ff]">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-[16px] bg-[#101314] text-center text-sm text-[#6f7c82]">
      <div>
        <Icon className="mx-auto mb-3 h-8 w-8 text-[#2c4f58]" />
        {text}
      </div>
    </div>
  );
}

export function ProjectsPanel({
  activeSessionId,
  onSelectSession,
  runs,
  sessions,
}: {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  runs: Run[];
  sessions: SessionSummary[];
}) {
  const projects = buildProjectIndex(runs);
  return (
    <PanelFrame kicker="Workspace index" title="Projects">
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => {
          const project = projects.find((item) => item.sessionId === session.id);
          return (
            <button
              className={[
                "rounded-[14px] bg-[#111516] p-4 text-left hover:bg-[#151c1e]",
                session.id === activeSessionId ? "ring-1 ring-[#00d1ff]/35" : "",
              ].join(" ")}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              type="button"
            >
              <div className="flex items-start gap-3">
                <FolderKanban className="mt-0.5 h-4 w-4 text-[#00d1ff]" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#dff7ff]">{session.title}</div>
                  <div className="mt-1 text-xs text-[#6f7c82]">{formatShortId(session.id)} · {project?.runCount ?? 0} runs</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {sessions.length === 0 ? <EmptyState icon={FolderKanban} text="No saved sessions yet." /> : null}
    </PanelFrame>
  );
}

export function RunsPanel({ runs }: { runs: Run[] }) {
  return (
    <PanelFrame kicker="Execution queue" title="Runs">
      <div className="space-y-2">
        {runs.map((run) => (
          <div className="flex items-center justify-between rounded-[12px] bg-[#111516] px-4 py-3" key={run.id}>
            <div>
              <div className="text-sm font-semibold text-[#dff7ff]">{formatShortId(run.id)}</div>
              <div className="mt-0.5 text-xs text-[#6f7c82]">{run.intent_type} · session {formatShortId(run.session_id)}</div>
            </div>
            <div className="rounded-full bg-[#0d2932] px-3 py-1 text-xs text-[#a4e6ff]">{run.status}</div>
          </div>
        ))}
      </div>
      {runs.length === 0 ? <EmptyState icon={Play} text="No runs in this workspace yet." /> : null}
    </PanelFrame>
  );
}

export function LibraryPanel({ artifacts }: { artifacts: Artifact[] }) {
  const stats = buildArtifactStats(artifacts);
  return (
    <PanelFrame kicker={`${stats.rawImages + stats.preparedImages} images · ${stats.objects3d} 3D`} title="Library">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {artifacts.map((artifact) => (
          <div className="rounded-[14px] bg-[#111516] p-3" key={artifact.id}>
            {artifact.kind.includes("image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={artifact.title} className="aspect-square w-full rounded-[8px] object-cover" src={artifactDownloadUrl(artifact.id)} />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-[8px] bg-[#0a0d0e] text-[#00d1ff]">
                <Box className="h-8 w-8" />
              </div>
            )}
            <div className="mt-3 truncate text-sm font-semibold text-[#dff7ff]">{artifact.title}</div>
            <div className="mt-1 text-xs text-[#6f7c82]">{artifact.kind} · {artifact.status}</div>
          </div>
        ))}
      </div>
      {artifacts.length === 0 ? <EmptyState icon={Library} text="Generated and uploaded assets will appear here." /> : null}
    </PanelFrame>
  );
}

export function ModelsPanel({ catalog, providers }: { catalog: ModelCatalogEntry[]; providers: ProviderModel[] }) {
  const queryClient = useQueryClient();
  const [modelRef, setModelRef] = useState("");
  const [providerKind, setProviderKind] = useState("huggingface");
  const [health, setHealth] = useState<Record<string, string>>({});
  const registerMutation = useMutation({
    mutationFn: () => registerProvider(modelRef.trim(), providerKind),
    onSuccess: async () => {
      setModelRef("");
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });
  const testMutation = useMutation({
    mutationFn: ({ providerId, capability }: { providerId: string; capability?: string }) => testProvider(providerId, capability),
    onSuccess: (result, variables) => {
      setHealth((current) => ({
        ...current,
        [variables.providerId]: `${result.ok ? "healthy" : "unhealthy"} · ${result.detail}`,
      }));
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ providerId, status }: { providerId: string; status: "active" | "disabled" }) => updateProviderStatus(providerId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  return (
    <PanelFrame kicker={`${providers.length} registered · ${catalog.length} presets`} title="Models">
      <div className="mb-5 grid gap-3 rounded-[14px] bg-[#111516] p-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input
          className="h-10 rounded-[10px] bg-[#0b0e0f] px-3 text-sm text-[#dff7ff] outline-none ring-1 ring-white/[0.04] focus:ring-[#00d1ff]/35"
          onChange={(event) => setModelRef(event.target.value)}
          placeholder="HF path, local path, NVIDIA model, or OpenRouter id"
          value={modelRef}
        />
        <select
          className="h-10 rounded-[10px] bg-[#0b0e0f] px-3 text-sm text-[#dff7ff] outline-none ring-1 ring-white/[0.04] focus:ring-[#00d1ff]/35"
          onChange={(event) => setProviderKind(event.target.value)}
          value={providerKind}
        >
          <option value="huggingface">Local / HF</option>
          <option value="nvidia">NVIDIA API</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <button
          className="h-10 rounded-[10px] bg-[#00d1ff] px-4 text-sm font-semibold text-[#061014] disabled:opacity-50"
          disabled={registerMutation.isPending || modelRef.trim().length === 0}
          onClick={() => registerMutation.mutate()}
          type="button"
        >
          {registerMutation.isPending ? "Adding" : "Add model"}
        </button>
      </div>
      {registerMutation.isError ? (
        <div className="mb-4 rounded-[12px] bg-[#321918] px-4 py-3 text-sm text-[#ffb3a4]">
          {registerMutation.error instanceof Error ? registerMutation.error.message : "Registration failed"}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {[...providers, ...catalog].map((model) => {
          const source = "source_kind" in model ? model.source_kind : model.sourceKind;
          const registered = model.id.startsWith("provider_");
          const provider = providers.find((item) => item.id === model.id);
          return (
            <div className="rounded-[14px] bg-[#111516] p-4" key={model.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#dff7ff]">{model.label}</div>
                  <div className="mt-1 break-all text-xs text-[#6f7c82]">{model.normalized_id}</div>
                </div>
                {registered ? <CheckCircle2 className="h-4 w-4 text-[#4ade80]" /> : <Cpu className="h-4 w-4 text-[#00d1ff]" />}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {model.capabilities.map((capability) => (
                  <span className="rounded-full bg-[#0d2932] px-2.5 py-1 text-[11px] text-[#a4e6ff]" key={capability}>{capability}</span>
                ))}
              </div>
              <div className="mt-3 text-xs text-[#6f7c82]">{source} · {model.status}</div>
              {provider ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-[9px] bg-[#0b0e0f] px-3 py-2 text-xs font-semibold text-[#a4e6ff]"
                    onClick={() => testMutation.mutate({ providerId: provider.id, capability: provider.capabilities[0] })}
                    type="button"
                  >
                    {testMutation.isPending && testMutation.variables?.providerId === provider.id ? "Testing" : "Test"}
                  </button>
                  <button
                    className="rounded-[9px] bg-[#0b0e0f] px-3 py-2 text-xs font-semibold text-[#dff7ff]"
                    onClick={() => statusMutation.mutate({ providerId: provider.id, status: provider.status === "disabled" ? "active" : "disabled" })}
                    type="button"
                  >
                    {provider.status === "disabled" ? "Enable" : "Disable"}
                  </button>
                  {health[provider.id] ? <span className="px-2 py-2 text-xs text-[#6f7c82]">{health[provider.id]}</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </PanelFrame>
  );
}

export function ThreeDPanel({ artifacts }: { artifacts: Artifact[] }) {
  const objects = artifacts.filter((artifact) => artifact.kind === "object3d");
  return (
    <PanelFrame kicker="Geometry outputs" title="3D Assets">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {objects.map((artifact) => (
          <a className="rounded-[14px] bg-[#111516] p-4 hover:bg-[#151c1e]" href={`/review?assetId=${artifact.id}`} key={artifact.id}>
            <Box className="mb-4 h-8 w-8 text-[#00d1ff]" />
            <div className="text-sm font-semibold text-[#dff7ff]">{artifact.title}</div>
            <div className="mt-1 text-xs text-[#6f7c82]">{artifact.status} · {formatShortId(artifact.id)}</div>
          </a>
        ))}
      </div>
      {objects.length === 0 ? <EmptyState icon={Box} text="3D conversions will appear here." /> : null}
    </PanelFrame>
  );
}

export function SettingsPanel({ catalog, providers }: { catalog: ModelCatalogEntry[]; providers: ProviderModel[] }) {
  const active = providers.filter((provider) => provider.status === "active");
  return (
    <PanelFrame kicker="Runtime readiness" title="Settings">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[14px] bg-[#111516] p-4">
          <Cpu className="mb-3 h-5 w-5 text-[#00d1ff]" />
          <div className="text-sm font-semibold text-[#dff7ff]">Active providers</div>
          <div className="mt-2 text-3xl font-bold text-[#a4e6ff]">{active.length}</div>
        </div>
        <div className="rounded-[14px] bg-[#111516] p-4">
          <Image className="mb-3 h-5 w-5 text-[#00d1ff]" />
          <div className="text-sm font-semibold text-[#dff7ff]">Image presets</div>
          <div className="mt-2 text-3xl font-bold text-[#a4e6ff]">{catalog.filter((item) => item.capabilities.includes("image_generation")).length}</div>
        </div>
        <div className="rounded-[14px] bg-[#111516] p-4">
          <AlertTriangle className="mb-3 h-5 w-5 text-[#fbbf24]" />
          <div className="text-sm font-semibold text-[#dff7ff]">API optional</div>
          <div className="mt-2 text-xs text-[#6f7c82]">Local inference remains first-class; API presets activate when keys exist.</div>
        </div>
      </div>
    </PanelFrame>
  );
}
