import { describe, expect, test } from "vitest";

import type { ProviderModel, SessionBundle } from "@forgeflow/contracts";

import { resolveProviderSummary, resolveVisibleArtifacts } from "./home-state";

describe("resolveProviderSummary", () => {
  test("prefers the session-selected providers over the registry default order", () => {
    const providers = [
      {
        id: "provider_default_planner",
        label: "Gemma",
        capabilities: ["planner_text", "text_chat"],
        status: "active",
      },
      {
        id: "provider_kimi",
        label: "Kimi",
        capabilities: ["planner_text", "text_chat", "vision_review"],
        status: "active",
      },
      {
        id: "provider_flux",
        label: "FLUX",
        capabilities: ["image_generation"],
        status: "active",
      },
      {
        id: "provider_trellis",
        label: "Trellis",
        capabilities: ["object3d_generation"],
        status: "active",
      },
    ] satisfies ProviderModel[];

    expect(
      resolveProviderSummary(providers, {
        preferred_providers: {
          planner_text: "provider_kimi",
        },
      }),
    ).toEqual({
      planner: "Kimi",
      image: "FLUX",
      object3d: "Trellis",
    });
  });
});

describe("resolveVisibleArtifacts", () => {
  test("keeps artifacts from the full session instead of only the latest run", () => {
    const bundle = {
      session: {
        id: "session_1",
        title: "Shield Concepts",
        created_at: "2026-04-19T11:00:00Z",
        metadata: {},
      },
      messages: [],
      runs: [
        {
          id: "run_old",
          session_id: "session_1",
          status: "completed",
          intent_type: "single_object_image",
          review_mode: "automatic_vlm",
          grouping_strategy: "single",
          plan: {
            id: "plan_1",
            intent_type: "single_object_image",
            requested_outputs: ["image"],
            review_mode: "automatic_vlm",
            stages: ["generate_images"],
            grouping_strategy: "single",
            needs_user_choice: false,
            system_prompt_profile: "single_object_image_only",
          },
          created_at: "2026-04-19T11:01:00Z",
          updated_at: "2026-04-19T11:02:00Z",
        },
        {
          id: "run_new",
          session_id: "session_1",
          status: "awaiting_review_mode",
          intent_type: "single_object_3d",
          review_mode: null,
          grouping_strategy: "single",
          plan: {
            id: "plan_2",
            intent_type: "single_object_3d",
            requested_outputs: ["object3d"],
            review_mode: null,
            stages: ["generate_3d"],
            grouping_strategy: "single",
            needs_user_choice: true,
            system_prompt_profile: "single_object_image_to_3d",
          },
          created_at: "2026-04-19T11:03:00Z",
          updated_at: "2026-04-19T11:03:00Z",
        },
      ],
      artifacts: [
        {
          id: "asset_image",
          run_id: "run_old",
          session_id: "session_1",
          stage: "generate_images",
          kind: "raw_image",
          status: "accepted",
          title: "Bronze Shield",
          group_key: "shield",
          path: "/tmp/shield.png",
          mime_type: "image/png",
          metadata: {},
          created_at: "2026-04-19T11:02:30Z",
        },
      ],
    } satisfies SessionBundle;

    expect(resolveVisibleArtifacts(bundle).map((artifact) => artifact.id)).toEqual(["asset_image"]);
  });
});
