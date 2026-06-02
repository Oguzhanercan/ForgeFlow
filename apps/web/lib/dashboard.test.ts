import { describe, expect, it } from "vitest";

import type { Artifact, Run } from "@forgeflow/contracts";

import { buildArtifactStats, buildProjectIndex, selectProjectRun } from "./dashboard";


function makeRun(overrides: Partial<Run>): Run {
  return {
    id: "run_1",
    session_id: "session_1",
    status: "completed",
    intent_type: "single_object_image",
    grouping_strategy: "object_identity",
    plan: {
      id: "plan_1",
      intent_type: "single_object_image",
      requested_outputs: ["image"],
      review_mode: null,
      stages: ["plan", "generate_images", "finalize_reply"],
      grouping_strategy: "object_identity",
      needs_user_choice: false,
      system_prompt_profile: "single_object_image_only",
    },
    created_at: "2026-04-09T10:00:00Z",
    updated_at: "2026-04-09T10:00:00Z",
    ...overrides,
  };
}

function makeArtifact(kind: Artifact["kind"], overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `asset_${kind}`,
    run_id: "run_1",
    session_id: "session_1",
    stage: "generate",
    kind,
    status: "generated",
    title: kind,
    group_key: "primary",
    path: `/tmp/${kind}`,
    created_at: "2026-04-09T10:00:00Z",
    ...overrides,
  };
}

describe("selectProjectRun", () => {
  it("prefers the selected run when it exists", () => {
    const selected = makeRun({ id: "run_selected", created_at: "2026-04-09T09:00:00Z" });
    const newer = makeRun({ id: "run_newer", created_at: "2026-04-09T11:00:00Z" });

    expect(selectProjectRun([selected, newer], "run_selected")?.id).toBe("run_selected");
  });

  it("falls back to the latest completed run", () => {
    const running = makeRun({ id: "run_running", status: "running", created_at: "2026-04-09T11:00:00Z" });
    const completed = makeRun({ id: "run_completed", status: "completed", created_at: "2026-04-09T10:00:00Z" });

    expect(selectProjectRun([running, completed])?.id).toBe("run_completed");
  });
});

describe("buildArtifactStats", () => {
  it("counts images, prepared images, objects, and catalogs", () => {
    const stats = buildArtifactStats([
      makeArtifact("raw_image"),
      makeArtifact("prepared_image"),
      makeArtifact("object3d"),
      makeArtifact("catalog"),
    ]);

    expect(stats.rawImages).toBe(1);
    expect(stats.preparedImages).toBe(1);
    expect(stats.objects3d).toBe(1);
    expect(stats.catalogs).toBe(1);
  });
});

describe("buildProjectIndex", () => {
  it("groups runs by session and prefers the latest run per project", () => {
    const runs = [
      makeRun({
        id: "run_old",
        session_id: "session_a",
        created_at: "2026-04-09T09:00:00Z",
        updated_at: "2026-04-09T09:00:00Z",
      }),
      makeRun({
        id: "run_new",
        session_id: "session_a",
        status: "running",
        created_at: "2026-04-09T11:00:00Z",
        updated_at: "2026-04-09T11:00:00Z",
      }),
      makeRun({
        id: "run_b",
        session_id: "session_b",
        created_at: "2026-04-09T10:00:00Z",
        updated_at: "2026-04-09T10:00:00Z",
      }),
    ];

    const projects = buildProjectIndex(runs);

    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      sessionId: "session_a",
      latestRunId: "run_new",
      runCount: 2,
    });
    expect(projects[1]).toMatchObject({
      sessionId: "session_b",
      latestRunId: "run_b",
      runCount: 1,
    });
  });
});
