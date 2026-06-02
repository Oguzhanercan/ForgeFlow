import { describe, expect, test } from "vitest";
import type { Run } from "@forgeflow/contracts";

import { buildRunFailure, normalizeRunErrorMessage } from "./run-errors";

function run(overrides: Partial<Run>): Run {
  return {
    id: "run_1",
    session_id: "session_1",
    status: "failed",
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
    created_at: "2026-06-02T08:18:25Z",
    updated_at: "2026-06-02T08:18:32Z",
    ...overrides,
  };
}

describe("run error helpers", () => {
  test("normalizes terminal noise before showing an error to the user", () => {
    expect(normalizeRunErrorMessage("\u001b[0;93mwarning\u001b[m\n\nTraceback")).toBe("warning\nTraceback");
  });

  test("builds a readable failure summary from backend run error_message", () => {
    const failure = buildRunFailure({
      run: run({
        error_message: "torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.42 GiB. GPU 0 has a total capacity of 23.57 GiB of which 722.12 MiB is free.",
      }),
    });

    expect(failure).toMatchObject({
      runId: "run_1",
      title: "Image generation failed",
      summary: "CUDA out of memory. Tried to allocate 2.42 GiB.",
    });
    expect(failure?.details).toContain("722.12 MiB is free");
  });
});
