import { describe, expect, test } from "vitest";
import type { Run } from "@forgeflow/contracts";

import { buildWorkspaceJobs, type LocalWorkspaceJob } from "./job-queue";
import { emptyLiveSessionState, reduceSessionEvent } from "./live-session";

function run(overrides: Partial<Run>): Run {
  return {
    id: "run_1",
    session_id: "session_1",
    status: "queued",
    intent_type: "single_object_image",
    review_mode: null,
    grouping_strategy: "single",
    plan: {
      id: "plan_1",
      intent_type: "single_object_image",
      requested_outputs: ["image"],
      review_mode: null,
      stages: ["generate"],
      grouping_strategy: "single",
      needs_user_choice: false,
      system_prompt_profile: "single_object_image_only",
    },
    created_at: "2026-05-07T10:00:00Z",
    updated_at: "2026-05-07T10:00:00Z",
    ...overrides,
  };
}

describe("workspace job queue", () => {
  test("shows queued and running server runs with live progress", () => {
    let live = reduceSessionEvent(emptyLiveSessionState, {
      type: "run.started",
      payload: { run_id: "run_running" },
    });
    live = reduceSessionEvent(live, {
      type: "stage.progress",
      payload: { run_id: "run_running", progress_pct: 45, label: "Generating image" },
    });

    const jobs = buildWorkspaceJobs({
      liveState: live,
      localJobs: [],
      runs: [
        run({ id: "run_queued", status: "queued", intent_type: "single_object_3d" }),
        run({ id: "run_running", status: "running", intent_type: "single_object_image" }),
        run({ id: "run_done", status: "completed" }),
      ],
    });

    expect(jobs.map((job) => [job.id, job.status, job.percent])).toEqual([
      ["run_queued", "queued", 0],
      ["run_running", "running", 45],
    ]);
    expect(jobs[1].label).toBe("Generating image");
  });

  test("keeps local action jobs visible beside server runs", () => {
    const localJobs: LocalWorkspaceJob[] = [
      {
        id: "local_remove_bg",
        label: "Remove Background",
        status: "running",
        percent: 18,
        createdAt: "2026-05-07T10:00:01Z",
      },
    ];

    const jobs = buildWorkspaceJobs({
      liveState: emptyLiveSessionState,
      localJobs,
      runs: [run({ id: "run_queued", status: "queued" })],
    });

    expect(jobs.map((job) => job.id)).toEqual(["run_queued", "local_remove_bg"]);
  });

  test("shows live queued runs before the session bundle refreshes", () => {
    const live = reduceSessionEvent(emptyLiveSessionState, {
      type: "run.created",
      payload: { run_id: "run_live", status: "queued", intent_type: "single_object_image" },
    });

    const jobs = buildWorkspaceJobs({
      liveState: live,
      localJobs: [],
      runs: [],
    });

    expect(jobs).toContainEqual(expect.objectContaining({
      id: "run_live",
      status: "queued",
      source: "server",
    }));
  });
});
