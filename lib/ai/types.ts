import { z } from "zod";

export const inputTypeSchema = z.enum(["official_product", "colleague_post", "reference"]);
export type AnalysisInputType = z.infer<typeof inputTypeSchema>;

export const hardFactSchema = z.object({
  field: z.string().min(1),
  value: z.string().min(1),
  source_quote: z.string().min(1),
  confidence: z.number().min(0).max(1),
  requires_confirmation: z.boolean(),
  freshness: z.enum(["current", "time_sensitive", "unknown"]),
  status: z.enum(["pending", "confirmed", "locked"]).default("pending"),
});

export const analysisResultSchema = z.object({
  hard_facts: z.array(hardFactSchema),
  subjective_claims: z.array(z.string()),
  uncertain_items: z.array(z.string()),
  product_summary: z.string(),
  possible_content_angles: z.array(z.string()),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type HardFact = z.infer<typeof hardFactSchema>;

export type AnalysisInput = { type: AnalysisInputType; text: string };

