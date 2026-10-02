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

const readableItemSchema = z.preprocess((value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    for (const key of ["claim", "text", "value", "item", "description", "angle", "content"]) {
      if (typeof item[key] === "string" && item[key]) return item[key];
    }
    const parts = Object.values(item).filter((part): part is string => typeof part === "string" && Boolean(part));
    if (parts.length) return parts.join("：");
  }
  return value;
}, z.string().min(1));

export const analysisResultSchema = z.object({
  hard_facts: z.array(hardFactSchema),
  subjective_claims: z.array(readableItemSchema),
  uncertain_items: z.array(readableItemSchema),
  product_summary: z.string(),
  possible_content_angles: z.array(readableItemSchema),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type HardFact = z.infer<typeof hardFactSchema>;

export type AnalysisInput = { type: AnalysisInputType; text: string };
