import type { ChatMessageApi } from "@forgeflow/contracts";

type SessionEventPayload = Record<string, unknown>;

export type SessionEventRecord = {
  type: string;
  payload: SessionEventPayload;
};

export type StreamingMessageState = {
  id: string;
  runId: string | null;
  streamId: string;
  content: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type RunProgressState = {
  runId: string;
  createdAt?: string;
  errorMessage?: string;
  intentType?: string;
  status: string;
  currentStage: string | null;
  stageIndex: number;
  stageCount: number;
  percent: number;
  completedItems: number;
  totalItems: number;
  label: string;
};

export type LiveSessionState = {
  optimisticMessages: ChatMessageApi[];
  streamingMessages: Record<string, StreamingMessageState>;
  runProgressByRun: Record<string, RunProgressState>;
  thinkingRunIds: string[];
};

export const emptyLiveSessionState: LiveSessionState = {
  optimisticMessages: [],
  streamingMessages: {},
  runProgressByRun: {},
  thinkingRunIds: [],
};

export function reduceSessionEvent(state: LiveSessionState, event: SessionEventRecord): LiveSessionState {
  if (event.type === "message.thinking") {
    const runId = asOptionalString(event.payload.run_id);
    const status = asOptionalString(event.payload.status);
    if (!runId) {
      return state;
    }
    const nextThinking = new Set(state.thinkingRunIds);
    if (status === "started") {
      nextThinking.add(runId);
    } else {
      nextThinking.delete(runId);
    }
    return { ...state, thinkingRunIds: Array.from(nextThinking) };
  }

  if (event.type === "message.stream.started") {
    const streamId = asOptionalString(event.payload.stream_id);
    if (!streamId) {
      return state;
    }
    const runId = asOptionalString(event.payload.run_id);
    return {
      ...state,
      streamingMessages: {
        ...state.streamingMessages,
        [streamId]: {
          id: `stream_${streamId}`,
          runId,
          streamId,
          content: "",
          createdAt: new Date().toISOString(),
          metadata: {
            type: "assistant_streaming",
            run_id: runId,
            stream_id: streamId,
          },
        },
      },
    };
  }

  if (event.type === "message.stream.delta") {
    const streamId = asOptionalString(event.payload.stream_id);
    const chunk = asOptionalString(event.payload.chunk) ?? "";
    if (!streamId || !state.streamingMessages[streamId]) {
      return state;
    }
    const current = state.streamingMessages[streamId];
    const nextThinking = new Set(state.thinkingRunIds);
    if (current.runId) {
      nextThinking.delete(current.runId);
    }
    return {
      ...state,
      thinkingRunIds: Array.from(nextThinking),
      streamingMessages: {
        ...state.streamingMessages,
        [streamId]: {
          ...current,
          content: `${current.content}${chunk}`,
        },
      },
    };
  }

  if (event.type === "message.created") {
    const message = event.payload as unknown as ChatMessageApi;
    const streamId = asOptionalString(message.metadata?.stream_id);
    const nextStreaming = { ...state.streamingMessages };
    if (streamId) {
      delete nextStreaming[streamId];
    }
    const nextThinking = new Set(state.thinkingRunIds);
    const runId = asOptionalString(message.metadata?.run_id);
    if (runId) {
      nextThinking.delete(runId);
    }
    const requestId = asOptionalString(message.metadata?.client_request_id);
    const nextOptimistic = state.optimisticMessages.filter((item) => {
      if (item.id === message.id) {
        return false;
      }
      const itemRequestId = asOptionalString(item.metadata?.client_request_id);
      return !requestId || itemRequestId !== requestId;
    });
    return {
      ...state,
      thinkingRunIds: Array.from(nextThinking),
      streamingMessages: nextStreaming,
      optimisticMessages: message.role === "assistant" ? [...nextOptimistic, message] : nextOptimistic,
    };
  }

  if (event.type === "run.created" || event.type === "run.started" || event.type === "stage.started" || event.type === "stage.progress" || event.type === "stage.completed" || event.type === "run.completed" || event.type === "run.failed") {
    const runId = asOptionalString(event.payload.run_id);
    if (!runId) {
      return state;
    }
    const current = state.runProgressByRun[runId] ?? {
      runId,
      status: "queued",
      currentStage: null,
      stageIndex: 0,
      stageCount: 0,
      percent: 0,
      completedItems: 0,
      totalItems: 0,
      label: "Queued",
    };
    const next = { ...current };
    if (event.type === "run.created") {
      next.status = asOptionalString(event.payload.status) ?? "queued";
      next.intentType = asOptionalString(event.payload.intent_type) ?? next.intentType;
      next.createdAt = asOptionalString(event.payload.created_at) ?? next.createdAt ?? new Date().toISOString();
      next.percent = next.status === "running" ? Math.max(next.percent, 4) : next.percent;
      next.label = next.intentType ? formatEventLabel(next.intentType) : next.label;
    }
    if (event.type === "run.started") {
      next.status = "running";
      next.label = "Thinking";
      next.percent = 4;
    }
    if (event.type === "stage.started" || event.type === "stage.progress" || event.type === "stage.completed") {
      next.status = "running";
      next.currentStage = asOptionalString(event.payload.stage);
      next.stageIndex = asOptionalNumber(event.payload.stage_index) ?? next.stageIndex;
      next.stageCount = asOptionalNumber(event.payload.stage_count) ?? next.stageCount;
      next.completedItems = asOptionalNumber(event.payload.completed_items) ?? next.completedItems;
      next.totalItems = asOptionalNumber(event.payload.total_items) ?? next.totalItems;
      next.percent = asOptionalNumber(event.payload.progress_pct) ?? next.percent;
      next.label = asOptionalString(event.payload.label) ?? next.currentStage ?? next.label;
    }
    if (event.type === "run.completed") {
      next.status = "completed";
      next.percent = 100;
      next.label = "Completed";
    }
    if (event.type === "run.failed") {
      next.status = "failed";
      next.label = "Failed";
      next.errorMessage = asOptionalString(event.payload.error) ?? asOptionalString(event.payload.error_message) ?? next.errorMessage;
    }
    return {
      ...state,
      runProgressByRun: {
        ...state.runProgressByRun,
        [runId]: next,
      },
    };
  }

  return state;
}

function formatEventLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function reconcileOptimisticMessages(
  optimisticMessages: ChatMessageApi[],
  serverMessages: ChatMessageApi[],
): ChatMessageApi[] {
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const serverRequestIds = new Set(
    serverMessages
      .map((message) => asOptionalString(message.metadata?.client_request_id))
      .filter((value): value is string => Boolean(value)),
  );
  return optimisticMessages.filter((message) => {
    const requestId = asOptionalString(message.metadata?.client_request_id);
    return !serverIds.has(message.id) && (!requestId || !serverRequestIds.has(requestId));
  });
}

export function buildRenderableMessages(
  serverMessages: ChatMessageApi[],
  state: LiveSessionState,
): ChatMessageApi[] {
  const optimisticMessages = reconcileOptimisticMessages(state.optimisticMessages, serverMessages);
  const streamingMessages = Object.values(state.streamingMessages).map(
    (message): ChatMessageApi => ({
      id: message.id,
      session_id: "live",
      role: "assistant",
      content: message.content,
      created_at: message.createdAt,
      metadata: message.metadata,
    }),
  );
  return [...serverMessages, ...optimisticMessages, ...streamingMessages];
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
