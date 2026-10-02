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

export const strategyTypeSchema = z.enum(["life", "advisor", "emotional"]);
export const strategySchema = z.object({
  type: strategyTypeSchema,
  title: z.string().min(1),
  approach: z.string().min(1),
  opening: z.string().min(1),
});
export const strategiesSchema = z.object({ strategies: z.array(strategySchema).length(3) });
export const blockSchema = z.object({ id: z.string().min(1), text: z.string().min(1), category: z.enum(["objective_fact","professional_advice","personal_experience","marketing","literary"]) });
export const draftSchema = z.object({ blocks: z.array(blockSchema).min(1) });
export const verificationSchema = z.object({ fact_safe: z.boolean(), fact_issues: z.array(readableItemSchema), naturalness_issues: z.array(readableItemSchema) });
export type Strategy = z.infer<typeof strategySchema>;
export type DraftBlock = z.infer<typeof blockSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type LockedFact = { field:string; value:string; source_quote?:string };
export type GenerationContext = { topic:string; facts:LockedFact[]; salesIntensity:0|1|2; stylePreferences:string[] };
export type RevisionInput = GenerationContext & { blocks:DraftBlock[]; lockedBlockIds:string[]; instruction:string; targetBlockId?:string };
export const inspirationDraftSchema=z.object({topics:z.array(z.object({title:z.string().min(4).refine(value=>(value.match(/[\u4e00-\u9fff]/g)||[]).length>=4,"标题必须为中文"),country:z.string().min(1),flag:z.string().min(1),reason:z.string().min(4),audience:z.string().min(2),content_type:z.string().min(2),source_index:z.number().int().min(0).nullable()})).length(4)});
export type InspirationDraft=z.infer<typeof inspirationDraftSchema>;
export type InspirationGenerationInput={sourceSummaries:Array<{title:string;content:string;institution:string}>;previousTitles:string[];recentCountries:string[];productName?:string;refreshNo:number};
export const storyboardSchema=z.object({roles:z.array(z.object({id:z.string(),label:z.string(),description:z.string(),searchTheme:z.string()})).min(4).max(9),searchThemes:z.array(z.object({label:z.string(),query:z.string()})).min(4).max(6)});
export type Storyboard=z.infer<typeof storyboardSchema>;
