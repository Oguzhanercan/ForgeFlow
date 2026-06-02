"use client";

import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import {
  Plus,
  Send,
  Upload,
  X,
  Box,
  Scissors,
  Maximize2,
} from "lucide-react";

import type { Artifact, ChatMessageApi, SessionBundle, SessionSummary } from "@forgeflow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, ReviewViewerSurface } from "@forgeflow/ui";

import {
  artifactDownloadUrl,
  createSession,
  fetchProviders,
  fetchSessionBundle,
  fetchSessions,
  openSessionEventStream,
  removeBackground,
  sendChatMessage,
  updateSession,
  uploadAsset,
  deleteSession,
} from "../lib/api";
import { shouldSubmitFromKeydown } from "../lib/chat-input";
import {
  buildRenderableMessages,
  emptyLiveSessionState,
  reconcileOptimisticMessages,
  reduceSessionEvent,
  type RunProgressState,
} from "../lib/live-session";
import { SESSION_STORAGE_KEY } from "../lib/session";
import { useForgeFlowUiStore } from "../lib/store";
import { buildWorkspaceIndex, defaultWorkspaceIdForSession, filterVisibleSessions } from "../lib/workspace";

/* ─── Types ────────────────────────────────────────── */
type SpatialNodeData = {
  id: string;
  x: number;
  y: number;
  isNew?: boolean;
  sourceId?: string;
  promptRunId?: string;
};

type FlowEdge = {
  fromId: string;
  toId: string;
  kind: "edit" | "bgremove" | "3d" | "prompt";
  label?: string;
};

/* ─── Helpers ─────────────────────────────────────── */
const TEMPLATES = [
  { icon: "\uD83D\uDDE1\uFE0F", label: "Fantasy Weapon", prompt: "Generate a photorealistic image of a glowing enchanted fantasy sword" },
  { icon: "\uD83C\uDFF0", label: "Gothic Castle", prompt: "Generate an aerial photograph of a gothic castle lit at midnight" },
  { icon: "\uD83E\uDDD9", label: "Character Portrait", prompt: "Create a photographic character portrait of a cyberpunk wizard in a neon-lit alley" },
  { icon: "\uD83D\uDEE1\uFE0F", label: "3D Game Prop", prompt: "Generate a ceremonial bronze shield image and convert it to a 3D game asset" },
];

function latestRun(bundle?: SessionBundle | null) {
  return bundle?.runs.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}
function resolveVisibleArtifacts(bundle?: SessionBundle | null): Artifact[] {
  return (bundle?.artifacts ?? []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}
function groupArtifacts(arts: Artifact[]) {
  return arts.reduce<Record<string, Artifact[]>>((acc, a) => {
    const k = a.group_key || "default";
    acc[k] ??= [];
    acc[k].push(a);
    return acc;
  }, {});
}

/* ─── FlowLine ─────────────────────────────────────── */
function FlowLine({ fromX, fromY, toX, toY, color, animated }: {
  fromX: number; fromY: number; toX: number; toY: number;
  color: string; animated: boolean;
}) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const d = `M ${fromX} ${fromY} C ${fromX + dx * 0.5} ${fromY}, ${fromX + dx * 0.5} ${toY}, ${toX} ${toY}`;
  return (
    <g>
      <path d={d} className="flow-path-solid" stroke={color} />
      {animated && <path d={d} className="flow-path" stroke={color} opacity={0.7} />}
    </g>
  );
}

export function HomeClient() {
  const queryClient = useQueryClient();
  const selectedAssetId = useForgeFlowUiStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useForgeFlowUiStore((s) => s.setSelectedAssetId);
  const activeSessionId = useForgeFlowUiStore((s) => s.activeSessionId);
  const setActiveSessionId = useForgeFlowUiStore((s) => s.setActiveSessionId);
  const composerReferenceAssetId = useForgeFlowUiStore((s) => s.composerReferenceAssetId);
  const setComposerReferenceAssetId = useForgeFlowUiStore((s) => s.setComposerReferenceAssetId);

  const [prompt, setPrompt] = useState("");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState(emptyLiveSessionState);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [sessionMenu, setSessionMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [radialMenu, setRadialMenu] = useState<{ artifactId: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [spatialNodes, setSpatialNodes] = useState<SpatialNodeData[]>([]);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([]);
  const [bgRemovingIds, setBgRemovingIds] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLDivElement>(null);
  const promptByRunId = useRef<Record<string, string>>({});

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null;
    const go = async () => {
      let sessionId = stored;
      if (sessionId) {
        try { await fetchSessionBundle(sessionId); } catch { sessionId = null; }
      }
      if (!sessionId || cancelled) {
        if (!cancelled) sessionId = (await createSession("ForgeFlow Workspace", { workspace_id: `ws_${crypto.randomUUID()}` })).id;
      }
      if (!cancelled) {
        const sid: string = sessionId!;
        window.localStorage.setItem(SESSION_STORAGE_KEY, sid);
        setActiveSessionId(sid);
        setBootstrapError(null);
      }
    };
    go().catch((e) => { if (!cancelled) setBootstrapError(e instanceof Error ? e.message : "Failed to bootstrap"); });
    return () => { cancelled = true; };
  }, [setActiveSessionId]);

  const sessionQuery = useQuery({
    queryKey: ["session", activeSessionId],
    queryFn: () => fetchSessionBundle(activeSessionId!),
    enabled: Boolean(activeSessionId),
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!activeSessionId) return;
    const source = openSessionEventStream(activeSessionId, (event) => {
      setLiveState((c) => reduceSessionEvent(c, event));
      if (event.type === "message.created" || event.type === "run.completed" || event.type === "run.failed") {
        void queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
      }
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [activeSessionId, queryClient]);

  useEffect(() => {
    if (!sessionQuery.data) return;
    setLiveState((c) => ({ ...c, optimisticMessages: reconcileOptimisticMessages(c.optimisticMessages, sessionQuery.data.messages as ChatMessageApi[]) }));
  }, [sessionQuery.data]);

  useEffect(() => { setLiveState(emptyLiveSessionState); }, [activeSessionId]);

  const sessionsQuery = useQuery({ queryKey: ["sessions"], queryFn: () => fetchSessions(), refetchInterval: 10000 });
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: fetchProviders, refetchInterval: 10000 });

  const sendMutation = useMutation({
    mutationFn: ({ content, metadata, clientRequestId }: { content: string; metadata?: Record<string, unknown>; clientRequestId: string }) =>
      sendChatMessage(activeSessionId!, content, undefined, { ...(metadata ?? {}), client_request_id: clientRequestId }),
    onMutate: async (v) => {
      setLiveState((c) => ({
        ...c,
        optimisticMessages: [...c.optimisticMessages, { id: `optimistic_${v.clientRequestId}`, session_id: activeSessionId ?? "pending", role: "user" as const, content: v.content, created_at: new Date().toISOString(), metadata: { ...(v.metadata ?? {}), client_request_id: v.clientRequestId } }],
      }));
      return v;
    },
    onSuccess: () => { setPrompt(""); void queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] }); void queryClient.invalidateQueries({ queryKey: ["sessions"] }); },
    onError: (_, v) => { setPrompt(v.content); showToast("Message could not be sent."); setLiveState((c) => ({ ...c, optimisticMessages: c.optimisticMessages.filter((m) => m.metadata?.client_request_id !== v.clientRequestId) })); },
  });

  const newSessionMutation = useMutation({
    mutationFn: async (workspaceId?: string) => createSession(`Workspace ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`, { workspace_id: workspaceId ?? `ws_${crypto.randomUUID()}` }),
    onSuccess: (s) => {
      setSelectedAssetId(null); setComposerReferenceAssetId(null); setPreviewAssetId(null);
      setLiveState(emptyLiveSessionState);
      window.localStorage.setItem(SESSION_STORAGE_KEY, s.id);
      setActiveSessionId(s.id);
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const sessionMutation = useMutation({
    mutationFn: ({ sessionId, title, metadata }: { sessionId: string; title?: string; metadata?: Record<string, unknown> }) => updateSession(sessionId, { title, metadata }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["sessions"] }); if (activeSessionId) await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] }); },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      if (deletedId === activeSessionId) {
        const fallback = filterVisibleSessions((await fetchSessions()) as SessionSummary[])[0] ?? null;
        if (fallback) { window.localStorage.setItem(SESSION_STORAGE_KEY, fallback.id); setActiveSessionId(fallback.id); }
        else { const c = await createSession("ForgeFlow Workspace", { workspace_id: `ws_${crypto.randomUUID()}` }); window.localStorage.setItem(SESSION_STORAGE_KEY, c.id); setActiveSessionId(c.id); }
      }
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => uploadAsset(activeSessionId!, file, title),
    onSuccess: (p) => { setSelectedAssetId(p.artifact.id); void queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] }); void queryClient.invalidateQueries({ queryKey: ["sessions"] }); },
    onError: (e) => showToast(e instanceof Error ? e.message : "Upload failed"),
  });

  const bgRemoveMutation = useMutation({
    mutationFn: (assetId: string) => removeBackground(assetId),
    onMutate: (assetId) => { setBgRemovingIds((s) => new Set(s).add(assetId)); showToast("Removing background..."); },
    onSuccess: (res, sourceId) => {
      setBgRemovingIds((s) => { const n = new Set(s); n.delete(sourceId); return n; });
      void queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
      setFlowEdges((prev) => [...prev, { fromId: sourceId, toId: res.artifact.id, kind: "bgremove" }]);
      showToast("Background removed!");
    },
    onError: (err, sourceId) => { setBgRemovingIds((s) => { const n = new Set(s); n.delete(sourceId); return n; }); showToast(`Error: ${err instanceof Error ? err.message.slice(0, 60) : "BG removal failed"}`); },
  });

  const bundle = sessionQuery.data;
  const run = latestRun(bundle);
  const artifacts = useMemo(() => resolveVisibleArtifacts(bundle), [bundle]);
  const activeRunProgress = useMemo<RunProgressState | null>(() => {
    if (run?.id && liveState.runProgressByRun[run.id]) return liveState.runProgressByRun[run.id];
    return Object.values(liveState.runProgressByRun).at(-1) ?? null;
  }, [liveState.runProgressByRun, run?.id]);

  const isThinking = Boolean(run?.id && liveState.thinkingRunIds.includes(run.id));
  const hasStream = Object.values(liveState.streamingMessages).some((m) => m.runId === (run?.id ?? null));
  const composerRef = artifacts.find((a) => a.id === composerReferenceAssetId) ?? null;
  const previewAsset = artifacts.find((a) => a.id === previewAssetId) ?? null;
  const isRunning = Boolean(activeRunProgress && !["completed", "failed"].includes(activeRunProgress.status));
  const isConnected = Boolean(activeSessionId && !sessionQuery.isPending && !bootstrapError);

  const renderableMessages = useMemo(() => buildRenderableMessages((bundle?.messages ?? []) as ChatMessageApi[], liveState), [bundle?.messages, liveState]);
  const sessions = filterVisibleSessions((sessionsQuery.data ?? []) as SessionSummary[]);
  const activeSessionSummary = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeWorkspaceId = activeSessionSummary ? defaultWorkspaceIdForSession(activeSessionSummary) : null;
  const workspaceGroups = buildWorkspaceIndex(sessions);

  useEffect(() => {
    const visualKinds = ["raw_image", "prepared_image", "object3d"];
    const visualArts = artifacts.filter((a) => visualKinds.includes(a.kind));
    setSpatialNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const newOnes = visualArts.filter((a) => !existingIds.has(a.id));
      if (newOnes.length === 0) return prev;
      const canvasW = canvasRef.current?.clientWidth ?? 900;
      const added: SpatialNodeData[] = newOnes.map((a, i) => {
        const hash = a.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const col = (hash % 4);
        const baseX = 60 + col * ((canvasW - 360) / 3);
        const baseY = 80 + Math.floor((prev.length + i) / 4) * 280;
        return { id: a.id, x: baseX + (hash % 60) - 30, y: baseY + ((hash * 7) % 60) - 30, isNew: true, sourceId: (a.metadata?.source_artifact_id as string | undefined), promptRunId: a.run_id };
      });
      window.setTimeout(() => { setSpatialNodes((cur) => cur.map((n) => ({ ...n, isNew: false }))); }, 1200);
      return [...prev, ...added];
    });
  }, [artifacts]);

  useEffect(() => {
    setFlowEdges((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.fromId}->${e.toId}`));
      const toAdd: FlowEdge[] = [];
      for (const art of artifacts) {
        const srcId = art.metadata?.source_artifact_id as string | undefined;
        const op = art.metadata?.operation as string | undefined;
        if (srcId && !existingKeys.has(`${srcId}->${art.id}`)) {
          toAdd.push({ fromId: srcId, toId: art.id, kind: op === "background_removal" ? "bgremove" : "edit" });
          existingKeys.add(`${srcId}->${art.id}`);
        }
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, [artifacts]);

  useEffect(() => {
    for (const msg of renderableMessages) {
      if (msg.role === "assistant" && typeof msg.content === "string" && msg.content.startsWith("Run ") && !msg.id.startsWith("optimistic_")) {
        const match = msg.content.match(/Run (\S+)/);
        const msgRunId = match?.[1];
        const correspondingRun = bundle?.runs.find((r) => r.id === msgRunId);
        if (correspondingRun && msg.metadata?.type !== "pipeline_plan") {
          promptByRunId.current[correspondingRun.id] = msg.content;
        }
      }
    }
  }, [renderableMessages, bundle?.runs]);

  useEffect(() => {
    setFlowEdges((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.fromId}->${e.toId}`));
      const toAdd: FlowEdge[] = [];
      for (const node of spatialNodes) {
        if (!node.promptRunId) continue;
        const label = promptByRunId.current[node.promptRunId];
        if (!label) continue;
        const msgArtifacts = artifacts.filter((a) => a.run_id === node.promptRunId && a.kind === "object3d");
        for (const art of msgArtifacts) {
          if (existingKeys.has(`${node.id}->${art.id}`)) continue;
          toAdd.push({ fromId: node.id, toId: art.id, kind: "prompt", label });
          existingKeys.add(`${node.id}->${art.id}`);
        }
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, [spatialNodes, artifacts]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [renderableMessages.length]);

  const submitPrompt = () => {
    if (!prompt.trim() || !activeSessionId) return;
    const selectedImageMetadata = composerRef && (composerRef.kind === "raw_image" || composerRef.kind === "prepared_image")
      ? { selected_asset_id: composerRef.id, selected_asset_kind: composerRef.kind, selected_asset_title: composerRef.title, selected_asset_group_key: composerRef.group_key }
      : undefined;
    sendMutation.mutate({ content: prompt.trim(), metadata: selectedImageMetadata, clientRequestId: `req_${crypto.randomUUID()}` });
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeSessionId) return;
    uploadMutation.mutate({ file, title: file.name.replace(/\.[^.]+$/, "") });
    event.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !activeSessionId) return;
    uploadMutation.mutate({ file, title: file.name.replace(/\.[^.]+$/, "") });
  };

  const sessionRail = (
    <div className="flex h-full flex-col gap-3 rounded-2xl bg-[#151617]/94 p-4 backdrop-blur-xl">
      <button
        className="w-full rounded-xl bg-[#9bdcf0] px-4 py-3 text-sm font-bold text-[#082a33] disabled:opacity-50"
        disabled={newSessionMutation.isPending}
        onClick={() => newSessionMutation.mutate(activeWorkspaceId ?? undefined)}
        type="button"
      >
        {newSessionMutation.isPending ? "Creating..." : "New Chat"}
      </button>
      <div className="flex-1 overflow-y-auto space-y-1">
        {workspaceGroups.map((group) => (
          <div key={group.workspaceId}>
            <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[#3a4a50]">
              {group.workspaceId === activeWorkspaceId ? "Current" : "Other"}
            </div>
            {group.sessions.map((s) => (
              <button
                key={s.id}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${s.id === activeSessionId ? "bg-[#0d2932] text-[#a4e6ff]" : "text-[#8fa5ad] hover:bg-[#141617]"}`}
                onClick={() => {
                  window.localStorage.setItem(SESSION_STORAGE_KEY, s.id);
                  setSelectedAssetId(null); setComposerReferenceAssetId(null); setPreviewAssetId(null);
                  setActiveSessionId(s.id);
                }}
                onContextMenu={(e) => { e.preventDefault(); setSessionMenu({ sessionId: s.id, x: e.clientX, y: e.clientY }); }}
                type="button"
              >
                <div className="truncate font-medium">{s.title}</div>
                <div className="text-[10px] opacity-50">{s.id.slice(-8)}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AppShell activeNav="Chat" title="ForgeFlow" subtitle="Chat Workspace" statusPill={activeRunProgress?.status ?? run?.status ?? "idle"}>
    <div className="flex h-[calc(100vh-120px)] min-h-0">
      {/* Session rail */}
      <aside className="w-[260px] shrink-0 border-r border-white/[0.04] p-3 overflow-hidden hidden xl:block">
        {sessionRail}
      </aside>

        {/* Main area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Progress bar */}
          <AnimatePresence>
            {(isThinking || isRunning || sendMutation.isPending) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ originX: 0 }}
                className="relative z-10 h-0.5"
              >
                <div
                  className="progress-bar-fill h-full"
                  style={{ width: `${Math.max(activeRunProgress?.percent ?? 8, isThinking || sendMutation.isPending ? 8 : 0)}%` }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Spatial Canvas */}
          <div
            ref={canvasRef}
            className="spatial-canvas"
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            {/* Empty state */}
            {spatialNodes.length === 0 && !isThinking && !isRunning && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-10 pb-[160px]"
              >
                <div className="text-center">
                  <motion.h1 className="font-headline text-3xl font-black sm:text-4xl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <span className="text-shimmer">What will you forge?</span>
                  </motion.h1>
                  <motion.p className="mt-3 text-sm text-[#5e7278]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                    Describe your idea below — images will float here as spatial objects you can drag, edit, and connect.
                  </motion.p>
                </div>
                <div className="stagger-children grid w-full max-w-2xl grid-cols-2 gap-3 px-8 sm:grid-cols-4">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      className="template-card glow-card flex flex-col items-start gap-3 bg-[#131516] p-4 text-left"
                      onClick={() => { setPrompt(t.prompt); textareaRef.current?.focus(); }}
                      type="button"
                    >
                      <span className="text-2xl float-breathe">{t.icon}</span>
                      <div>
                        <div className="text-sm font-bold text-[#dde8ec]">{t.label}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-[#5e7278]">{t.prompt}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Thinking indicator */}
            <AnimatePresence>
              {(isThinking || isRunning) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 rounded-[24px] glass-panel px-6 py-4 shadow-2xl z-10"
                >
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="ml-1 text-sm font-semibold text-[#a4e6ff]">
                    {activeRunProgress?.label ?? (isRunning ? "Generating..." : "Thinking...")}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SVG flow lines */}
            <svg className="flow-svg" aria-hidden="true">
              <defs>
                <marker id="arrow-cyan" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="rgba(0,229,255,0.5)" />
                </marker>
                <marker id="arrow-green" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="rgba(74,222,128,0.5)" />
                </marker>
                <marker id="arrow-violet" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="rgba(179,136,255,0.5)" />
                </marker>
              </defs>
              {flowEdges.map((edge) => {
                const fromNode = spatialNodes.find((n) => n.id === edge.fromId);
                const toNode = spatialNodes.find((n) => n.id === edge.toId);
                if (!fromNode || !toNode) return null;
                const nodeW = 260;
                const nodeH = 220;
                const isPrompt = edge.kind === "prompt";
                const color = edge.kind === "bgremove" ? "rgba(74,222,128,0.55)" : edge.kind === "3d" ? "rgba(179,136,255,0.55)" : isPrompt ? "rgba(255,255,255,0.10)" : "rgba(0,229,255,0.55)";
                const fx = fromNode.x + nodeW / 2;
                const fy = isPrompt ? fromNode.y : fromNode.y + nodeH / 2;
                const tx = toNode.x + nodeW / 2;
                const ty = isPrompt ? toNode.y - 4 : toNode.y + nodeH / 2;
                return (
                  <g key={`${edge.fromId}->${edge.toId}`}>
                    {isPrompt ? (
                      <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={color} strokeWidth="1" strokeDasharray="4 6" />
                    ) : (
                      <FlowLine fromX={fromNode.x + nodeW} fromY={fromNode.y + nodeH / 2} toX={toNode.x} toY={toNode.y + nodeH / 2} color={color} animated={true} />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Spatial nodes */}
            <AnimatePresence>
              {spatialNodes.map((node) => {
                const art = artifacts.find((a) => a.id === node.id);
                if (!art) return null;
                const isImg = art.kind === "raw_image" || art.kind === "prepared_image";
                const is3d = art.kind === "object3d";
                const isNoBg = art.metadata?.operation === "background_removal";
                const isBgRemoving = bgRemovingIds.has(art.id);

                return (
                  <motion.div
                    key={node.id}
                    className={`spatial-node ${node.isNew ? "node-arrive" : ""}`}
                    style={{ left: 0, top: 0, width: 260, x: node.x, y: node.y, zIndex: selectedAssetId === node.id ? 30 : 10 }}
                    drag
                    dragMomentum={false}
                    dragElastic={0}
                    onDragEnd={(_, info) => {
                      setSpatialNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, x: Math.max(0, n.x + info.offset.x), y: Math.max(0, n.y + info.offset.y) } : n));
                    }}
                    initial={{ opacity: 0, scale: 0.75 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: "spring", stiffness: 280, damping: 26 }}
                    whileTap={{ zIndex: 50, scale: 1.02 }}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="group overflow-hidden rounded-xl glass-panel shadow-[0_12px_40px_rgba(0,0,0,0.45)] border border-white/[0.06] transition-shadow hover:shadow-[0_18px_48px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,209,255,0.10)]">
                      <div className={`relative overflow-hidden ${isNoBg ? "checker-bg" : "bg-[#0c0e0f]"}`} style={{ height: 180 }}>
                        {isImg ? (
                          <>
                            <img alt={art.title} src={artifactDownloadUrl(art.id)} className="parallax-img w-full h-full object-contain cursor-context-menu" draggable={false}
                              onClick={() => setSelectedAssetId(art.id)}
                              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setRadialMenu({ artifactId: art.id, x: e.clientX, y: e.clientY }); }}
                            />
                            {isNoBg && <div className="absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5"><span className="ben2-badge text-[9px]">BEN2</span></div>}
                            {isBgRemoving && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                <svg width="48" height="48" viewBox="0 0 80 80">
                                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,229,255,0.15)" strokeWidth="6" />
                                  <circle cx="40" cy="40" r="32" fill="none" stroke="#00e5ff" strokeWidth="6" className="spinner-ring" />
                                </svg>
                              </div>
                            )}
                          </>
                        ) : is3d ? (
                          <button
                            className="inline-3d-viewer flex h-full w-full items-center justify-center flex-col gap-2 text-center hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a4e6ff]/50"
                            onClick={(e) => { e.stopPropagation(); setSelectedAssetId(art.id); setPreviewAssetId(art.id); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            type="button"
                          >
                              <Box className="h-10 w-10 text-[#a4e6ff] opacity-70 float-breathe" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a4e6ff]/60">Click to view 3D</span>
                          </button>
                        ) : null}

                        {/* Hover overlay */}
                        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="flex gap-1.5">
                            <button className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-[#00e5ff]/20 hover:text-[#00e5ff] transition-colors backdrop-blur-sm"
                              onClick={(e) => { e.stopPropagation(); setComposerReferenceAssetId(art.id); showToast("Added as reference"); }} title="Use as reference" type="button">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            {isImg && (
                              <button className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-[#4ade80]/20 hover:text-[#4ade80] transition-colors backdrop-blur-sm"
                                onClick={(e) => { e.stopPropagation(); if (!isBgRemoving) bgRemoveMutation.mutate(art.id); }} title="Remove background (BEN2)" type="button" disabled={isBgRemoving}>
                                <Scissors className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-[#b388ff]/20 hover:text-[#b388ff] transition-colors backdrop-blur-sm"
                              onClick={(e) => { e.stopPropagation(); setRadialMenu({ artifactId: art.id, x: e.clientX, y: e.clientY }); }} title="More options" type="button">
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Node footer */}
                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold text-[#c8d8dc]">{art.title}</div></div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isNoBg && <span className="rounded-full bg-[#4ade80]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#4ade80]/70">no bg</span>}
                          {is3d && <span className="rounded-full bg-[#b388ff]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#b388ff]/70">3D</span>}
                          <div className="h-1.5 w-1.5 rounded-full bg-[#00d1ff] opacity-40 ml-0.5" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Chat messages */}
            <div className="absolute bottom-[160px] left-4 flex flex-col-reverse gap-2 max-w-[min(420px,45vw)] max-h-[40vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <AnimatePresence initial={false}>
                {renderableMessages
                  .filter((msg) => {
                    const isPipelinePlan = msg.metadata?.type === "pipeline_plan";
                    const isRunCompletion = msg.role === "assistant" && typeof msg.content === "string" && msg.content.startsWith("Run ") && msg.content.includes(" completed.");
                    return !isPipelinePlan && !isRunCompletion;
                  })
                  .slice(-6)
                  .map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 360, damping: 30 }}
                      className={`rounded-[20px] px-4 py-3 text-sm leading-relaxed shadow-xl backdrop-blur-md max-w-full ${msg.role === "user" ? "bg-[#0d2932]/90 text-[#a4e6ff] self-end ml-auto border border-[#00d1ff]/10" : "bg-[#111314]/90 text-[#c8d8dc] border border-white/[0.05]"}`}
                    >
                      {typeof msg.content === "string" ? msg.content.slice(0, 200) : ""}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Chat composer */}
          <div className="shrink-0 border-t border-white/[0.04] bg-[#0a0c0d]/95 backdrop-blur-xl px-4 py-3">
            <form
              className="mx-auto flex max-w-5xl items-end gap-3"
              onSubmit={(e) => { e.preventDefault(); submitPrompt(); }}
            >
              <input ref={uploadInputRef} accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} type="file" />
              <textarea
                ref={textareaRef}
                className="min-h-[48px] flex-1 resize-none bg-transparent py-3 text-[15px] font-medium text-[#dde8ec] placeholder:text-[#5e7278] focus:outline-none"
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (!shouldSubmitFromKeydown({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) return;
                  e.preventDefault(); submitPrompt();
                }}
                placeholder="Describe what you want to create..."
                rows={1}
                value={prompt}
                style={{ height: "auto" }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111214] text-[#8fa5ad] hover:text-[#dde8ec] transition-colors disabled:opacity-30"
                  disabled={uploadMutation.isPending || !activeSessionId}
                  onClick={() => uploadInputRef.current?.click()}
                  type="button" title="Upload image">
                  <Upload className="h-5 w-5" />
                </button>
                <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#a4e6ff] to-[#00d1ff] text-[#003543] disabled:opacity-30 transition-opacity"
                  disabled={sendMutation.isPending || !prompt.trim() || !activeSessionId}
                  type="submit">
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* 3D Preview Modal */}
      <AnimatePresence>
        {previewAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={() => setPreviewAssetId(null)}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="relative h-[84vh] w-[92vw] max-w-5xl overflow-hidden rounded-2xl bg-[#111314] shadow-[0_32px_110px_rgba(0,0,0,0.68)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#5e7278]">3D Preview</div>
                  <div className="mt-0.5 font-headline text-base font-black text-[#e7faff]">{previewAsset.title}</div>
                </div>
                <button className="rounded-lg bg-[#1a1d1f] px-4 py-2 text-sm font-semibold text-[#dde8ec]" onClick={() => setPreviewAssetId(null)} type="button">Close</button>
              </div>
              <div className="h-[calc(100%-76px)]">
                <ReviewViewerSurface
                  allowPreviewFallback={true}
                  modelLabel={previewAsset.title}
                  modelUrl={artifactDownloadUrl(previewAsset.id, "glb")}
                  reviewStatus="Generated"
                  sourceLabel="ForgeFlow Artifact"
                  surface="modal"
                  technicalNotes={`${previewAsset.kind} • ${previewAsset.stage}`}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session Context Menu */}
      <AnimatePresence>
        {sessionMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[120] min-w-[200px] overflow-hidden rounded-[18px] border border-white/[0.05] bg-[#111314]/98 p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            style={{ left: sessionMenu.x, top: sessionMenu.y }}
          >
            {[
              { label: "Rename", color: "text-[#dde8ec]", action: () => {
                const s = sessions.find((x) => x.id === sessionMenu.sessionId);
                const t = window.prompt("Rename chat", s?.title ?? "");
                setSessionMenu(null);
                if (t?.trim()) sessionMutation.mutate({ sessionId: sessionMenu.sessionId, title: t.trim(), metadata: { auto_named: false } });
              }},
              { label: "Delete", color: "text-[#ff8a80]", action: () => { if (window.confirm("Delete this chat?")) { setSessionMenu(null); deleteSessionMutation.mutate(sessionMenu.sessionId); } else setSessionMenu(null); }},
            ].map((item) => (
              <button key={item.label} className={`w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium ${item.color} hover:bg-white/[0.05] transition-colors`} onClick={item.action} type="button">
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Radial Context Menu */}
      <AnimatePresence>
        {radialMenu && (
          <div className="fixed inset-0 z-[100] pointer-events-none" onContextMenu={(e) => e.preventDefault()}>
            <motion.div className="absolute pointer-events-auto" style={{ left: radialMenu.x, top: radialMenu.y }} initial="hidden" animate="visible" exit="hidden">
              <motion.div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 shadow-[0_0_15px_rgba(0,229,255,0.4)]" initial={{ width: 0, height: 0 }} animate={{ width: 12, height: 12 }} exit={{ width: 0, height: 0 }} transition={{ type: "spring", stiffness: 400, damping: 20 }} />
              {[
                { icon: "\u270F\uFE0F", label: "Edit", color: "#00e5ff", action: () => { setComposerReferenceAssetId(radialMenu.artifactId); setPrompt("Edit this image to "); setTimeout(() => textareaRef.current?.focus(), 100); }},
                { icon: "\u2702\uFE0F", label: "Remove BG", color: "#4ade80", action: () => { bgRemoveMutation.mutate(radialMenu.artifactId); } },
                { icon: "\uD83E\uDDCA", label: "Make 3D", color: "#b388ff", action: () => {
                  const art = artifacts.find(a => a.id === radialMenu.artifactId);
                  sendMutation.mutate({ content: "Convert this image to a 3D asset", metadata: { selected_asset_id: radialMenu.artifactId, selected_asset_kind: art?.kind, selected_asset_title: art?.title, selected_asset_group_key: art?.group_key }, clientRequestId: `req_${crypto.randomUUID()}` });
                }},
                { icon: "\uD83D\uDDD1\uFE0F", label: "Delete", color: "#ff8a80", action: () => showToast("Artifact deleted") },
              ].map((item, i, arr) => {
                const totalAngle = Math.PI * 1.5;
                const startAngle = -Math.PI;
                const angle = startAngle + (i / (arr.length - 1)) * totalAngle;
                const radius = 80;
                return (
                  <motion.button
                    key={item.label}
                    className="absolute flex items-center justify-center w-12 h-12 rounded-full glass-panel shadow-2xl hover:bg-white/10 group radial-menu-btn"
                    initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                    animate={{ x: Math.cos(angle) * radius - 24, y: Math.sin(angle) * radius - 24, scale: 1, opacity: 1 }}
                    exit={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 350, damping: 22, delay: i * 0.03 }}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); setRadialMenu(null); item.action(); }}
                    type="button"
                  >
                    <span className="text-xl drop-shadow-md">{item.icon}</span>
                    <div className="absolute top-14 opacity-0 group-hover:opacity-100 bg-[#080808]/90 backdrop-blur-md px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider text-[#00e5ff] whitespace-nowrap pointer-events-none transition-opacity shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-white/10">
                      {item.label}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-[18px] bg-[#0d2932] px-5 py-3 text-sm font-semibold text-[#a4e6ff] shadow-[0_16px_48px_rgba(0,209,255,0.18)] backdrop-blur-md"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={uploadInputRef} accept="image/*" className="hidden" onChange={handleUpload} type="file" />
    </AppShell>
  );
}
