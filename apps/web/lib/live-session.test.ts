import { describe, expect, test } from "vitest";

import {
  buildRenderableMessages,
  emptyLiveSessionState,
  reconcileOptimisticMessages,
  reduceSessionEvent,
  type LiveSessionState,
} from "./live-session";

describe("reduceSessionEvent", () => {
  test("tracks thinking and streaming assistant output", () => {
    let state = emptyLiveSessionState;

    state = reduceSessionEvent(state, {
      type: "message.thinking",
      payload: { run_id: "run_1", status: "started" },
    });
    expect(state.thinkingRunIds).toContain("run_1");

    state = reduceSessionEvent(state, {
      type: "message.stream.started",
      payload: { run_id: "run_1", stream_id: "stream_1" },
    });
    state = reduceSessionEvent(state, {
      type: "message.stream.delta",
      payload: { run_id: "run_1", stream_id: "stream_1", chunk: "Hello " },
    });
    state = reduceSessionEvent(state, {
      type: "message.stream.delta",
      payload: { run_id: "run_1", stream_id: "stream_1", chunk: "world" },
    });

    const renderable = buildRenderableMessages([], state);
    expect(renderable.at(-1)?.content).toBe("Hello world");
    expect(state.thinkingRunIds).not.toContain("run_1");
  });

  test("reconciles stream placeholder when final message arrives", () => {
    let state = reduceSessionEvent(emptyLiveSessionState, {
      type: "message.stream.started",
      payload: { run_id: "run_1", stream_id: "stream_1" },
    });
    state = reduceSessionEvent(state, {
      type: "message.stream.delta",
      payload: { run_id: "run_1", stream_id: "stream_1", chunk: "Final answer" },
    });
    state = reduceSessionEvent(state, {
      type: "message.created",
      payload: {
        id: "msg_1",
        session_id: "session_1",
        role: "assistant",
        content: "Final answer",
        created_at: new Date().toISOString(),
        metadata: { run_id: "run_1", stream_id: "stream_1" },
      },
    });

    const renderable = buildRenderableMessages([], state);
    expect(renderable).toHaveLength(1);
    expect(renderable[0].id).toBe("msg_1");
    expect(renderable[0].content).toBe("Final answer");
  });

  test("tracks run progress from stage events", () => {
    let state = reduceSessionEvent(emptyLiveSessionState, {
      type: "run.started",
      payload: { run_id: "run_1" },
    });
    state = reduceSessionEvent(state, {
      type: "stage.started",
      payload: {
        run_id: "run_1",
        stage: "generate_images",
        stage_index: 2,
        stage_count: 5,
        progress_pct: 20,
        label: "Generating images",
      },
    });
    state = reduceSessionEvent(state, {
      type: "stage.progress",
      payload: {
        run_id: "run_1",
        stage: "generate_images",
        stage_index: 2,
        stage_count: 5,
        completed_items: 3,
        total_items: 10,
        progress_pct: 32,
        label: "Generating images",
      },
    });

    expect(state.runProgressByRun.run_1.percent).toBe(32);
    expect(state.runProgressByRun.run_1.completedItems).toBe(3);
    expect(state.runProgressByRun.run_1.label).toBe("Generating images");
  });

  test("tracks queued runs as soon as run.created arrives", () => {
    const state = reduceSessionEvent(emptyLiveSessionState, {
      type: "run.created",
      payload: {
        run_id: "run_queued",
        status: "queued",
        intent_type: "single_object_image",
      },
    });

    expect(state.runProgressByRun.run_queued).toMatchObject({
      runId: "run_queued",
      status: "queued",
      percent: 0,
      label: "Single Object Image",
    });
  });

  test("keeps run failure details from live events", () => {
    const state = reduceSessionEvent(emptyLiveSessionState, {
      type: "run.failed",
      payload: {
        run_id: "run_failed",
        error: "torch.OutOfMemoryError: CUDA out of memory.",
      },
    });

    expect(state.runProgressByRun.run_failed).toMatchObject({
      runId: "run_failed",
      status: "failed",
      label: "Failed",
      errorMessage: "torch.OutOfMemoryError: CUDA out of memory.",
    });
  });

  test("reconciles optimistic messages by client request id", () => {
    const optimistic = [
      {
        id: "optimistic_1",
        session_id: "session_1",
        role: "user",
        content: "Generate shield",
        created_at: new Date().toISOString(),
        metadata: { client_request_id: "req_1" },
      },
    ];
    const server = [
      {
        id: "msg_1",
        session_id: "session_1",
        role: "user",
        content: "Generate shield",
        created_at: new Date().toISOString(),
        metadata: { client_request_id: "req_1" },
      },
    ];

    expect(reconcileOptimisticMessages(optimistic, server)).toHaveLength(0);
  });

  test("message.created clears the matching optimistic user placeholder instead of keeping a duplicate copy", () => {
    let state: LiveSessionState = {
      ...emptyLiveSessionState,
      optimisticMessages: [
        {
          id: "optimistic_req_1",
          session_id: "session_1",
          role: "user",
          content: "merhaba",
          created_at: new Date().toISOString(),
          metadata: { client_request_id: "req_1" },
        },
      ],
    };

    state = reduceSessionEvent(state, {
      type: "message.created",
      payload: {
        id: "msg_1",
        session_id: "session_1",
        role: "user",
        content: "merhaba",
        created_at: new Date().toISOString(),
        metadata: { client_request_id: "req_1" },
      },
    });

    expect(state.optimisticMessages).toHaveLength(0);
  });

  test("message.created keeps assistant messages visible until the server bundle catches up", () => {
    const state = reduceSessionEvent(emptyLiveSessionState, {
      type: "message.created",
      payload: {
        id: "msg_assistant_1",
        session_id: "session_1",
        role: "assistant",
        content: "Generated one shield image.",
        created_at: new Date().toISOString(),
        metadata: { run_id: "run_1" },
      },
    });

    const renderable = buildRenderableMessages([], state);
    expect(renderable).toHaveLength(1);
    expect(renderable[0].id).toBe("msg_assistant_1");
  });
});
