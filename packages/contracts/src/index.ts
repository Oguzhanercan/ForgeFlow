import { z } from "zod";

export const pipelinePlanSchema = z.object({
  id: z.string(),
  intent_type: z.enum([
    "chat_only",
    "single_object_image",
    "single_object_3d",
    "image_plus_3d",
    "asset_pack",
    "mixed_request"
  ]),
  requested_outputs: z.array(z.string()),
  review_mode: z.enum(["manual", "automatic_vlm", "hybrid"]).nullable(),
  stages: z.array(z.string()),
  grouping_strategy: z.string(),
  needs_user_choice: z.boolean(),
  system_prompt_profile: z.string(),
  planner_notes: z.string().nullable().optional()
});

export const providerModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  normalized_id: z.string().optional(),
  sourceKind: z.string().optional(),
  source_kind: z.string().optional(),
  capabilities: z.array(z.string()),
  status: z.string(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const modelCatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  normalized_id: z.string(),
  source_kind: z.string(),
  capabilities: z.array(z.string()),
  status: z.string(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const runSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  status: z.string(),
  intent_type: z.string(),
  review_mode: z.string().nullable().optional(),
  grouping_strategy: z.string(),
  plan: pipelinePlanSchema,
  error_message: z.string().nullable().optional(),
  created_at: z.string().or(z.date()),
  updated_at: z.string().or(z.date()),
  artifacts: z.array(z.any()).optional()
});

export const artifactSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  session_id: z.string(),
  stage: z.string(),
  kind: z.string(),
  status: z.string(),
  title: z.string(),
  group_key: z.string(),
  path: z.string(),
  mime_type: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().or(z.date())
});

export const chatMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  role: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().or(z.date())
});

export const sessionBundleSchema = z.object({
  session: z.object({
    id: z.string(),
    title: z.string(),
    created_at: z.string().or(z.date()),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
  messages: z.array(chatMessageSchema),
  runs: z.array(runSchema),
  artifacts: z.array(artifactSchema)
});

export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string().or(z.date()),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type PipelinePlan = z.infer<typeof pipelinePlanSchema>;
export type ProviderModel = z.infer<typeof providerModelSchema>;
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;
export type Run = z.infer<typeof runSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ChatMessageApi = z.infer<typeof chatMessageSchema>;
export type SessionBundle = z.infer<typeof sessionBundleSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export type ChatCardMessage = {
  id: string;
  role: "user" | "assistant";
  type:
    | "user"
    | "assistant"
    | "pipeline_plan"
    | "progress"
    | "review_summary"
    | "rerun_recommendation";
  content: string;
  planSummary?: string;
};

export type ReviewOption = "manual" | "automatic_vlm" | "hybrid";

export type AssetCard = {
  id: string;
  title: string;
  status: string;
  subtitle?: string;
  badge?: string;
};

export type AssetGroup = {
  title: string;
  items: AssetCard[];
};
