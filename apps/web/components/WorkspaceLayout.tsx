"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionSummary } from "@forgeflow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { ReviewViewerSurface } from "@forgeflow/ui";

import { GlobalRail } from "./GlobalRail";
import { ProjectSidebar } from "./ProjectSidebar";
import { TopToolbar } from "./TopToolbar";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { AssetInspector } from "./AssetInspector";
import { CommandBar } from "./CommandBar";
import { JobQueuePanel } from "./JobQueuePanel";
import { useForgeFlowUiStore } from "../lib/store";
import {
  artifactDownloadUrl,
  createSession,
  fetchModelCatalog,
  fetchProviders,
  fetchRuns,
  fetchSessionBundle,
  fetchSessions,
  openSessionEventStream,
  removeBackground,
  sendChatMessage,
} from "../lib/api";
import { buildCanvasEdges, buildCanvasGraph, latestRun, mapRunStatus } from "../lib/commercial-workspace";
import {
  emptyLiveSessionState,
  reconcileOptimisticMessages,
  reduceSessionEvent,
  type RunProgressState,
} from "../lib/live-session";
import { buildWorkspaceJobs, type LocalWorkspaceJob } from "../lib/job-queue";
import { mergeModelOptions } from "../lib/model-registry";
import { buildRunFailure, normalizeRunErrorMessage, type RunFailure } from "../lib/run-errors";
import { ensureValidSession, SESSION_STORAGE_KEY } from "../lib/session";
import type { CanvasNode, CanvasNodeAction, CommandModelSelection, ComposerMode } from "./types";
import {
  LibraryPanel,
  ModelsPanel,
  ProjectsPanel,
  RunsPanel,
  SettingsPanel,
  ThreeDPanel,
} from "./panels/WorkspacePanels";

function ChatView({
  canvasEdges,
  canvasNodes,
  disabled,
  isSubmitting,
  onNodeAction,
  onOpen3D,
  onSubmitPrompt,
  selectedNode,
  modelOptions,
}: {
  canvasEdges: ReturnType<typeof buildCanvasEdges>;
  canvasNodes: CanvasNode[];
  disabled: boolean;
  isSubmitting: boolean;
  onNodeAction: (action: CanvasNodeAction, node: CanvasNode) => void;
  onOpen3D: (node: CanvasNode) => void;
  onSubmitPrompt: (prompt: string, mode: ComposerMode, modelSelection: CommandModelSelection) => void;
  selectedNode: CanvasNode | null;
  modelOptions: ReturnType<typeof mergeModelOptions>;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <CanvasWorkspace edges={canvasEdges} nodes={canvasNodes} onNodeAction={onNodeAction} onOpen3D={onOpen3D} />
      </div>
      <CommandBar disabled={disabled} isSubmitting={isSubmitting} modelOptions={modelOptions} selectedNode={selectedNode} onSubmitPrompt={onSubmitPrompt} />
    </div>
  );
}

function formatModeLabel(mode: ComposerMode) {
  return mode
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function WorkspaceLayout() {
  const queryClient = useQueryClient();
  const activePanel = useForgeFlowUiStore((s) => s.activePanel);
  const activeSessionId = useForgeFlowUiStore((s) => s.activeSessionId);
  const selectedNodeId = useForgeFlowUiStore((s) => s.selectedNodeId);
  const setActivePanel = useForgeFlowUiStore((s) => s.setActivePanel);
  const setActiveSessionId = useForgeFlowUiStore((s) => s.setActiveSessionId);
  const setCommandMode = useForgeFlowUiStore((s) => s.setCommandMode);
  const setComposerReferenceAssetId = useForgeFlowUiStore((s) => s.setComposerReferenceAssetId);
  const setProjectName = useForgeFlowUiStore((s) => s.setProjectName);
  const setRunStatus = useForgeFlowUiStore((s) => s.setRunStatus);
  const setSelectedNodeId = useForgeFlowUiStore((s) => s.setSelectedNodeId);
  const sidebarCollapsed = useForgeFlowUiStore((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useForgeFlowUiStore((s) => s.inspectorCollapsed);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState(emptyLiveSessionState);
  const [localJobs, setLocalJobs] = useState<LocalWorkspaceJob[]>([]);
  const [previewNode, setPreviewNode] = useState<CanvasNode | null>(null);
  const [dismissedFailureRunIds, setDismissedFailureRunIds] = useState<Set<string>>(new Set());
  const [manualFailure, setManualFailure] = useState<RunFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureValidSession({
      storedSessionId: typeof window !== "undefined" ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null,
      fetchSessionBundle,
      createSession: () => createSession("ForgeFlow Workspace", { workspace_id: `ws_${crypto.randomUUID()}` }),
    })
      .then(({ sessionId }) => {
        if (cancelled) return;
        window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
        setActiveSessionId(sessionId);
        setBootstrapError(null);
      })
      .catch((error) => {
        if (!cancelled) setBootstrapError(error instanceof Error ? error.message : "Failed to bootstrap session");
      });
    return () => {
      cancelled = true;
    };
  }, [setActiveSessionId]);

  const sessionQuery = useQuery({
    queryKey: ["session", activeSessionId],
    queryFn: () => fetchSessionBundle(activeSessionId!),
    enabled: Boolean(activeSessionId),
    refetchInterval: 8000,
  });
  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => fetchSessions(),
    refetchInterval: 10000,
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
    refetchInterval: 5000,
  });
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
    refetchInterval: 10000,
  });
  const catalogQuery = useQuery({
    queryKey: ["model-catalog"],
    queryFn: fetchModelCatalog,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!activeSessionId) return;
    const source = openSessionEventStream(activeSessionId, (event) => {
      setLiveState((current) => reduceSessionEvent(current, event));
      if (["message.created", "run.completed", "run.failed", "asset.uploaded"].includes(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
        void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      }
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [activeSessionId, queryClient]);

  useEffect(() => {
    if (!sessionQuery.data) return;
    setLiveState((current) => ({
      ...current,
      optimisticMessages: reconcileOptimisticMessages(current.optimisticMessages, sessionQuery.data.messages),
    }));
    setProjectName(sessionQuery.data.session.title);
  }, [sessionQuery.data, setProjectName]);

  const run = latestRun(sessionQuery.data?.runs ?? []);
  const activeRunProgress = useMemo<RunProgressState | null>(() => {
    if (run?.id && liveState.runProgressByRun[run.id]) return liveState.runProgressByRun[run.id];
    return Object.values(liveState.runProgressByRun).at(-1) ?? null;
  }, [liveState.runProgressByRun, run?.id]);
  const runFailure = useMemo(
    () => buildRunFailure({ progress: activeRunProgress, run }),
    [activeRunProgress, run],
  );
  const visibleFailure = manualFailure ?? (
    runFailure && !dismissedFailureRunIds.has(runFailure.runId) ? runFailure : null
  );
  const canvasGraph = useMemo(() => buildCanvasGraph({
    artifacts: sessionQuery.data?.artifacts ?? [],
    messages: [...(sessionQuery.data?.messages ?? []), ...liveState.optimisticMessages],
    runs: sessionQuery.data?.runs ?? [],
  }), [liveState.optimisticMessages, sessionQuery.data?.artifacts, sessionQuery.data?.messages, sessionQuery.data?.runs]);
  const canvasNodes = canvasGraph.nodes;
  const canvasEdges = canvasGraph.edges;
  const selectedNode = canvasNodes.find((node) => node.id === selectedNodeId) ?? null;
  const workspaceJobs = useMemo(() => buildWorkspaceJobs({
    liveState,
    localJobs,
    runs: sessionQuery.data?.runs ?? [],
  }), [liveState, localJobs, sessionQuery.data?.runs]);
  const sessions = (sessionsQuery.data ?? []) as SessionSummary[];
  const isConnected = Boolean(activeSessionId && !sessionQuery.isPending && !bootstrapError);

  useEffect(() => {
    setRunStatus(mapRunStatus(activeRunProgress?.status ?? run?.status));
  }, [activeRunProgress?.status, run?.status, setRunStatus]);

  const sendMutation = useMutation({
    mutationFn: ({ content, mode, modelSelection, node, requestId }: { content: string; mode: ComposerMode; modelSelection?: CommandModelSelection; node?: CanvasNode; localJobId: string; requestId: string }) => {
      const metadata: Record<string, unknown> = {
        command_mode: mode,
        client_request_id: requestId,
        ...(modelSelection ?? {}),
      };
      const targetNode = node ?? selectedNode;
      if (targetNode?.metadata?.artifactId) {
        metadata.selected_asset_id = targetNode.metadata.artifactId;
        metadata.selected_asset_kind = targetNode.metadata.artifactKind;
        metadata.selected_asset_title = targetNode.title;
        metadata.selected_asset_group_key = targetNode.metadata.groupKey;
      }
      return sendChatMessage(activeSessionId!, content, undefined, metadata);
    },
    onMutate: ({ content, localJobId, mode, requestId }) => {
      const optimisticId = `optimistic_${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      setLocalJobs((current) => [
        ...current,
        {
          id: localJobId,
          label: `${formatModeLabel(mode)} · ${content}`,
          status: "queued",
          percent: 0,
          createdAt,
        },
      ]);
      setLiveState((current) => ({
        ...current,
        optimisticMessages: [
          ...current.optimisticMessages,
          {
            id: optimisticId,
            session_id: activeSessionId ?? "pending",
            role: "user",
            content,
            created_at: createdAt,
            metadata: { client_request_id: requestId },
          },
        ],
      }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error, variables) => {
      const details = normalizeRunErrorMessage(error instanceof Error ? error.message : "Message submission failed.");
      setManualFailure({
        runId: variables.localJobId,
        title: "Request failed",
        summary: details.split("\n")[0] ?? "Request failed.",
        details,
      });
    },
    onSettled: (_data, error, variables) => {
      setLocalJobs((current) => current.map((job) => (
        job.id === variables.localJobId
          ? { ...job, status: error ? "failed" : "running", percent: error ? 100 : Math.max(job.percent, 12) }
          : job
      )));
      window.setTimeout(() => {
        setLocalJobs((current) => current.filter((job) => job.id !== variables.localJobId));
      }, error ? 3200 : 1800);
    },
  });

  const removeBackgroundMutation = useMutation({
    mutationFn: (node: CanvasNode) => {
      if (!node.metadata?.artifactId) throw new Error("Selected node has no artifact");
      return removeBackground(node.metadata.artifactId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error) => {
      const details = normalizeRunErrorMessage(error instanceof Error ? error.message : "Background removal failed.");
      setManualFailure({
        runId: `local_error_${Date.now()}`,
        title: "Background removal failed",
        summary: details.split("\n")[0] ?? "Background removal failed.",
        details,
      });
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: () => createSession(`Workspace ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`, { workspace_id: `ws_${crypto.randomUUID()}` }),
    onSuccess: (session) => {
      window.localStorage.setItem(SESSION_STORAGE_KEY, session.id);
      setActiveSessionId(session.id);
      setProjectName(session.title);
      setSelectedNodeId(null);
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const selectSession = useCallback((sessionId: string) => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    setActiveSessionId(sessionId);
    setSelectedNodeId(null);
    setComposerReferenceAssetId(null);
    setPreviewNode(null);
    setLocalJobs([]);
    setLiveState(emptyLiveSessionState);
    setProjectName(sessions.find((session) => session.id === sessionId)?.title ?? "ForgeFlow Workspace");
    setActivePanel("chat");
    void queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
  }, [queryClient, sessions, setActivePanel, setActiveSessionId, setComposerReferenceAssetId, setProjectName, setSelectedNodeId]);

  const open3D = useCallback((node: CanvasNode) => {
    setSelectedNodeId(node.id);
    setPreviewNode(node);
  }, [setSelectedNodeId]);

  const closeFailurePopup = useCallback(() => {
    if (manualFailure) {
      setManualFailure(null);
      return;
    }
    if (runFailure) {
      setDismissedFailureRunIds((current) => new Set(current).add(runFailure.runId));
    }
  }, [manualFailure, runFailure]);

  const submitPrompt = useCallback((prompt: string, mode: ComposerMode, modelSelection: CommandModelSelection) => {
    if (!activeSessionId || !prompt.trim()) return;
    setActivePanel("chat");
    sendMutation.mutate({
      content: prompt.trim(),
      localJobId: `local_prompt_${crypto.randomUUID()}`,
      mode,
      modelSelection,
      requestId: `req_${crypto.randomUUID()}`,
    });
  }, [activeSessionId, sendMutation, setActivePanel]);

  const handleNodeAction = useCallback((action: CanvasNodeAction, node: CanvasNode) => {
    setSelectedNodeId(node.id);
    if (node.metadata?.artifactId) setComposerReferenceAssetId(node.metadata.artifactId);

    if (action === "view_3d") {
      open3D(node);
      return;
    }
    if (action === "edit") {
      setCommandMode("image_edit");
      setActivePanel("chat");
      return;
    }
    if (action === "use_as_reference") {
      setCommandMode("workflow");
      setActivePanel("chat");
      return;
    }
    if (action === "remove_background") {
      setCommandMode("background_removal");
      const jobId = `local_remove_bg_${crypto.randomUUID()}`;
      setLocalJobs((current) => [
        ...current,
        {
          id: jobId,
          label: `Remove Background · ${node.title}`,
          status: "running",
          percent: 18,
          createdAt: new Date().toISOString(),
        },
      ]);
      removeBackgroundMutation.mutateAsync(node)
        .then(() => {
          setLocalJobs((current) => current.map((job) => job.id === jobId ? { ...job, percent: 100 } : job));
        })
        .finally(() => {
          window.setTimeout(() => {
            setLocalJobs((current) => current.filter((job) => job.id !== jobId));
          }, 900);
        });
      return;
    }
    if (action === "generate_3d") {
      setCommandMode("image_to_3d");
      if (!activeSessionId) return;
      sendMutation.mutate({
        content: "Convert this image to a 3D asset",
        localJobId: `local_3d_${crypto.randomUUID()}`,
        mode: "image_to_3d",
        node,
        requestId: `req_${crypto.randomUUID()}`,
      });
    }
  }, [activeSessionId, open3D, removeBackgroundMutation, sendMutation, setActivePanel, setCommandMode, setComposerReferenceAssetId, setSelectedNodeId]);

  const providers = providersQuery.data ?? [];
  const catalog = catalogQuery.data ?? [];
  const modelOptions = useMemo(() => mergeModelOptions({ catalog, providers }), [catalog, providers]);

  const activeView = (() => {
    if (activePanel === "chat") {
      return (
        <ChatView
          canvasEdges={canvasEdges}
          canvasNodes={canvasNodes}
          disabled={!isConnected}
          isSubmitting={sendMutation.isPending || removeBackgroundMutation.isPending}
          modelOptions={modelOptions}
          onNodeAction={handleNodeAction}
          onOpen3D={open3D}
          selectedNode={selectedNode}
          onSubmitPrompt={submitPrompt}
        />
      );
    }
    if (activePanel === "projects") {
      return <ProjectsPanel activeSessionId={activeSessionId} onSelectSession={selectSession} runs={runsQuery.data ?? []} sessions={sessions} />;
    }
    if (activePanel === "runs") {
      return <RunsPanel runs={runsQuery.data ?? sessionQuery.data?.runs ?? []} />;
    }
    if (activePanel === "library") {
      return <LibraryPanel artifacts={sessionQuery.data?.artifacts ?? []} />;
    }
    if (activePanel === "models") {
      return <ModelsPanel catalog={catalog} providers={providers} />;
    }
    if (activePanel === "3d") {
      return <ThreeDPanel artifacts={sessionQuery.data?.artifacts ?? []} />;
    }
    return <SettingsPanel catalog={catalog} providers={providers} />;
  })();

  return (
    <div className="ff-cosmos-shell flex h-screen flex-col overflow-hidden bg-[#0c0c0d]">
      <GlobalRail />

      <div className="flex flex-1 flex-col overflow-hidden pl-[56px]">
        <TopToolbar progressLabel={activeRunProgress?.label ?? run?.intent_type ?? null} progressPercent={activeRunProgress?.percent ?? null} />

        <div className="flex flex-1 overflow-hidden">
          {!sidebarCollapsed && (
            <div className="flex h-full flex-col overflow-hidden border-r border-white/[0.04] bg-[#0f1010]" style={{ width: 260, minWidth: 260 }}>
              <ProjectSidebar
                activeSessionId={activeSessionId}
                isCreating={createSessionMutation.isPending}
                onCreateSession={() => createSessionMutation.mutate()}
                onSelectSession={selectSession}
                sessions={sessions}
              />
            </div>
          )}

          <div className="relative flex min-w-0 flex-1 overflow-hidden">
            {activeView}
            <JobQueuePanel jobs={workspaceJobs} />
          </div>

          {!inspectorCollapsed && (
            <div className="flex h-full flex-col overflow-hidden border-l border-white/[0.04] bg-[#0f1010]" style={{ width: 320, minWidth: 320 }}>
              <AssetInspector nodes={canvasNodes} onOpen3D={open3D} />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {visibleFailure && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/72 p-5 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeFailurePopup}
          >
            <motion.div
              className="w-full max-w-2xl overflow-hidden rounded-[18px] border border-[#f87171]/25 bg-[#111314] shadow-[0_32px_110px_rgba(0,0,0,0.7)]"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
                <div className="flex min-w-0 gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#3a1518] text-[#f87171]">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f87171]">Run Error</div>
                    <div className="mt-1 text-base font-semibold text-[#fff3f3]">{visibleFailure.title}</div>
                    <div className="mt-1 text-sm text-[#fca5a5]">{visibleFailure.summary}</div>
                  </div>
                </div>
                <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#859399] hover:bg-white/[0.06] hover:text-[#dff7ff]" onClick={closeFailurePopup} type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6f7c82]">Details</div>
                <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-[14px] border border-white/[0.06] bg-[#08090a] p-4 text-xs leading-relaxed text-[#cfd8dc]">
                  {visibleFailure.details}
                </pre>
              </div>
            </motion.div>
          </motion.div>
        )}

        {previewNode && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewNode(null)}
          >
            <motion.div
              className="relative h-[84vh] w-[92vw] max-w-6xl overflow-hidden rounded-[18px] border border-white/[0.06] bg-[#111314] shadow-[0_32px_110px_rgba(0,0,0,0.68)]"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a6368]">3D Viewer</div>
                  <div className="mt-0.5 font-headline text-sm font-semibold text-[#dff7ff]">{previewNode.title}</div>
                </div>
                <button className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#859399] hover:bg-white/[0.06] hover:text-[#dff7ff]" onClick={() => setPreviewNode(null)} type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[calc(100%-58px)]">
                <ReviewViewerSurface
                  allowPreviewFallback
                  modelLabel={previewNode.title}
                  modelUrl={previewNode.metadata?.artifactId ? artifactDownloadUrl(previewNode.metadata.artifactId, "glb") : previewNode.assetUrl}
                  reviewStatus={previewNode.status}
                  sourceLabel="ForgeFlow Canvas"
                  surface="modal"
                  technicalNotes={`${previewNode.metadata?.artifactKind ?? previewNode.type} • ${previewNode.metadata?.stage ?? "3D"}`}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
