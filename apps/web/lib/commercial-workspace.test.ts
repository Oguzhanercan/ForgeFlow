import { describe, expect, test } from "vitest";
import type { Artifact, ChatMessageApi, Run } from "@forgeflow/contracts";

import { buildCanvasEdges, buildCanvasGraph, buildCanvasNodes } from "./commercial-workspace";

function artifact(overrides: Partial<Artifact>): Artifact {
  return {
    id: "asset_1",
    run_id: "run_1",
    session_id: "session_1",
    stage: "generate",
    kind: "raw_image",
    status: "generated",
    title: "Asset",
    group_key: "default",
    path: "/tmp/asset",
    created_at: "2026-05-07T10:00:00Z",
    metadata: {},
    ...overrides,
  };
}

function run(overrides: Partial<Run>): Run {
  return {
    id: "run_1",
    session_id: "session_1",
    status: "completed",
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
    created_at: "2026-05-07T10:00:02Z",
    updated_at: "2026-05-07T10:00:03Z",
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessageApi>): ChatMessageApi {
  return {
    id: "msg_1",
    session_id: "session_1",
    role: "user",
    content: "make castle ottoman style",
    created_at: "2026-05-07T10:00:00Z",
    metadata: {},
    ...overrides,
  };
}

describe("commercial workspace mapping", () => {
  test("turns backend artifacts into commercial canvas nodes", () => {
    const nodes = buildCanvasNodes([
      artifact({ id: "image_1", kind: "raw_image", title: "Shield" }),
      artifact({ id: "model_1", kind: "object3d", title: "Shield GLB" }),
    ]);

    expect(nodes.map((node) => [node.id, node.type])).toEqual([
      ["image_1", "image_generation"],
      ["model_1", "three_d_preview"],
    ]);
    expect(nodes[1].metadata?.artifactId).toBe("model_1");
    expect(nodes[1].assetUrl).toContain("/assets/model_1/download.glb");
  });

  test("preserves lineage edges from source artifacts", () => {
    const artifacts = [
      artifact({ id: "image_1", kind: "raw_image" }),
      artifact({ id: "model_1", kind: "object3d", metadata: { source_artifact_id: "image_1" } }),
    ];
    const nodes = buildCanvasNodes(artifacts);

    expect(buildCanvasEdges(nodes, artifacts)).toEqual([
      {
        id: "edge_image_1_model_1",
        sourceNodeId: "image_1",
        targetNodeId: "model_1",
        relation: "three_d_conversion",
      },
    ]);
  });

  test("creates prompt nodes and generation edges from chat messages", () => {
    const graph = buildCanvasGraph({
      artifacts: [artifact({ id: "image_1", run_id: "run_1", created_at: "2026-05-07T10:00:20Z" })],
      messages: [message({ id: "msg_1", content: "make castle ottoman style" })],
      runs: [run({ id: "run_1", created_at: "2026-05-07T10:00:02Z" })],
    });

    expect(graph.nodes.map((node) => [node.id, node.type])).toEqual([
      ["prompt_msg_1", "prompt"],
      ["image_1", "image_generation"],
    ]);
    expect(graph.nodes[0].metadata?.prompt).toBe("make castle ottoman style");
    expect(graph.edges).toContainEqual({
      id: "edge_prompt_msg_1_image_1",
      sourceNodeId: "prompt_msg_1",
      targetNodeId: "image_1",
      relation: "generation",
    });
  });

  test("infers edit lineage from selected asset chat metadata when artifact metadata omits the source", () => {
    const graph = buildCanvasGraph({
      artifacts: [
        artifact({ id: "image_original", run_id: "run_1", created_at: "2026-05-07T09:59:00Z" }),
        artifact({ id: "image_edit", run_id: "run_2", created_at: "2026-05-07T10:00:20Z" }),
      ],
      messages: [
        message({ id: "msg_1", content: "generate an image of castle", created_at: "2026-05-07T09:58:59Z" }),
        message({
          id: "msg_2",
          content: "make castle ottoman style",
          created_at: "2026-05-07T10:00:00Z",
          metadata: { command_mode: "image_edit", selected_asset_id: "image_original" },
        }),
      ],
      runs: [
        run({ id: "run_1", created_at: "2026-05-07T09:59:01Z" }),
        run({ id: "run_2", created_at: "2026-05-07T10:00:02Z" }),
      ],
    });

    expect(graph.nodes.find((node) => node.id === "image_edit")?.type).toBe("image_edit");
    expect(graph.edges).toContainEqual({
      id: "edge_image_original_image_edit",
      sourceNodeId: "image_original",
      targetNodeId: "image_edit",
      relation: "edit",
    });
  });
});
