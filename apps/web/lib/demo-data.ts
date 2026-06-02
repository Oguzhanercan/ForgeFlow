import type { AssetGroup, ChatCardMessage, ProviderModel, Run } from "@forgeflow/contracts";

export const demoMessages: ChatCardMessage[] = [
  {
    id: "m1",
    role: "user",
    type: "user",
    content: "Build a fortress gate module, shield set, and 3D-ready commander bust for a bronze desert kingdom."
  },
  {
    id: "m2",
    role: "assistant",
    type: "pipeline_plan",
    content: "Request classified as image_plus_3d with manual review required before 3D promotion.",
    planSummary: "Plan -> Images -> Review -> 3D -> Catalog"
  }
];

export const demoGroups: AssetGroup[] = [
  {
    title: "Gate Modules",
    items: [
      { id: "g1", title: "Sun Gate A", status: "generated" },
      { id: "g2", title: "Sun Gate B", status: "generated" }
    ]
  },
  {
    title: "Shield Variants",
    items: [
      { id: "s1", title: "Bronze Shield A", status: "generated" },
      { id: "s2", title: "Bronze Shield B", status: "reviewed" }
    ]
  }
];

export const demoProviders: ProviderModel[] = [
  {
    id: "p1",
    label: "NVIDIA / moonshotai/kimi-k2.5",
    normalized_id: "moonshotai/kimi-k2.5",
    source_kind: "api_generic",
    capabilities: ["planner_text", "text_chat", "vision_review"],
    status: "active"
  },
  {
    id: "p2",
    label: "NVIDIA / black-forest-labs/flux.2-klein-4b",
    normalized_id: "black-forest-labs/flux.2-klein-4b",
    source_kind: "api_generic",
    capabilities: ["image_generation", "image_editing"],
    status: "active"
  },
  {
    id: "p3",
    label: "NVIDIA / microsoft/trellis",
    normalized_id: "microsoft/trellis",
    source_kind: "api_generic",
    capabilities: ["object3d_generation"],
    status: "active"
  }
];

export const demoRuns: Run[] = [
  {
    id: "run_001",
    session_id: "session_001",
    status: "awaiting_review_mode",
    intent_type: "image_plus_3d",
    review_mode: null,
    grouping_strategy: "object_identity",
    plan: {
      id: "plan_001",
      intent_type: "image_plus_3d",
      requested_outputs: ["image", "3d"],
      review_mode: null,
      stages: ["plan", "generate_images", "prepare_images", "review_images", "generate_3d", "review_3d", "finalize_reply"],
      grouping_strategy: "object_identity",
      needs_user_choice: true,
      system_prompt_profile: "single_object_image_to_3d"
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
