import type { Artifact, ModelCatalogEntry, ProviderModel, Run, SessionBundle, SessionSummary } from "@forgeflow/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_FORGEFLOW_API ?? "http://127.0.0.1:8000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(await formatApiError(response));
  }
  return (await response.json()) as T;
}

async function formatApiError(response: Response) {
  const fallback = `API request failed: ${response.status}`;
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const body = JSON.parse(text) as { detail?: unknown; error?: unknown; message?: unknown };
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === "string" && detail.trim()) return `${fallback}: ${detail.trim()}`;
    if (detail) return `${fallback}: ${JSON.stringify(detail)}`;
  } catch {
    const detail = text.trim();
    if (detail) return `${fallback}: ${detail}`;
  }
  return fallback;
}

export function apiBaseUrl() {
  return API_BASE_URL;
}

export async function createSession(title: string, metadata?: Record<string, unknown>) {
  return fetchJson<{ id: string; title: string; created_at: string; metadata?: Record<string, unknown> }>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ title, metadata: metadata ?? {} })
  });
}

export async function fetchSessions(includeArchived = false) {
  const suffix = includeArchived ? "?include_archived=1" : "";
  return fetchJson<SessionSummary[]>(`/chat/sessions${suffix}`);
}

export async function fetchSessionBundle(sessionId: string): Promise<SessionBundle> {
  return fetchJson<SessionBundle>(`/chat/sessions/${sessionId}`);
}

export async function updateSession(sessionId: string, payload: { title?: string; metadata?: Record<string, unknown> }) {
  return fetchJson<SessionSummary>(`/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSession(sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await formatApiError(response));
  }
}

export async function sendChatMessage(
  sessionId: string,
  content: string,
  reviewMode?: string,
  metadata?: Record<string, unknown>,
) {
  return fetchJson<{ message: unknown; run: Run }>(`/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, role: "user", review_mode: reviewMode ?? null, metadata: metadata ?? {} })
  });
}

export async function setRunReviewMode(runId: string, reviewMode: string) {
  return fetchJson<{ run_id: string; status: string; review_mode: string }>(`/runs/${runId}/review-mode`, {
    method: "POST",
    body: JSON.stringify({ review_mode: reviewMode })
  });
}

export async function fetchProviders(): Promise<ProviderModel[]> {
  return fetchJson<ProviderModel[]>("/providers/models");
}

export async function fetchModelCatalog(): Promise<ModelCatalogEntry[]> {
  return fetchJson<ModelCatalogEntry[]>("/providers/catalog");
}

export async function registerProvider(modelRef: string, providerKind: string) {
  return fetchJson<ProviderModel>("/providers/register", {
    method: "POST",
    body: JSON.stringify({ model_ref: modelRef, provider_kind: providerKind })
  });
}

export async function testProvider(providerId: string, capability?: string) {
  return fetchJson<{ ok: boolean; detail: string }>("/providers/test", {
    method: "POST",
    body: JSON.stringify({ provider_id: providerId, capability })
  });
}

export async function updateProviderStatus(providerId: string, status: "active" | "disabled") {
  return fetchJson<ProviderModel>(`/providers/${providerId}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function fetchRuns(): Promise<Run[]> {
  return fetchJson<Run[]>("/runs");
}

export async function fetchRun(runId: string) {
  return fetchJson<Run & { artifacts: Artifact[] }>(`/runs/${runId}`);
}

export async function fetchAsset(assetId: string): Promise<Artifact> {
  return fetchJson<Artifact>(`/assets/${assetId}`);
}

export async function retryRun(runId: string) {
  return fetchJson<{ run_id: string; status: string; intent_type: string }>(`/runs/${runId}/retry`, {
    method: "POST"
  });
}

export async function reviewAsset(assetId: string, decision: string, note?: string) {
  return fetchJson(`/assets/${assetId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ decision, note: note ?? null })
  });
}

export async function uploadAsset(sessionId: string, file: File, title?: string) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("file", file);
  if (title) {
    formData.append("title", title);
  }
  const response = await fetch(`${API_BASE_URL}/assets/upload`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await formatApiError(response));
  }
  return (await response.json()) as { artifact: Artifact; run: Run };
}

export async function fetchProjectCatalog(projectId: string) {
  return fetchJson<{
    run_id: string;
    entry_count: number;
    groups: Array<{
      group: string;
      items: Array<{
        artifact_id: string;
        title: string;
        kind: string;
        status: string;
        path?: string;
        group?: string;
      }>;
    }>;
  }>(`/projects/${projectId}/catalog`);
}

export function artifactDownloadUrl(assetId: string, ext?: string) {
  return `${API_BASE_URL}/assets/${assetId}/download${ext ? `.${ext}` : ""}`;
}

export async function removeBackground(assetId: string): Promise<{ artifact: Artifact }> {
  return fetchJson<{ artifact: Artifact }>(`/assets/${assetId}/remove-background`, { method: "POST" });
}

export function openSessionEventStream(
  sessionId: string,
  onEvent: (event: { type: string; payload: Record<string, unknown> }) => void,
) {
  const source = new EventSource(`${API_BASE_URL}/chat/sessions/${sessionId}/events?live=1`);
  const forward = (type: string) => (event: MessageEvent<string>) => {
    const record = JSON.parse(event.data) as { payload?: Record<string, unknown> };
    onEvent({ type, payload: record.payload ?? {} });
  };

  const eventTypes = [
    "message.created",
    "message.thinking",
    "message.stream.started",
    "message.stream.delta",
    "message.stream.completed",
    "run.started",
    "run.created",
    "run.completed",
    "run.failed",
    "stage.started",
    "stage.progress",
    "stage.completed",
    "review.manual_required",
    "asset.uploaded",
  ];

  for (const type of eventTypes) {
    source.addEventListener(type, forward(type) as EventListener);
  }

  return source;
}
