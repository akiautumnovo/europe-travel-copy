import type { AnalysisInput, AnalysisResult, Draft, GenerationContext, InspirationDraft, InspirationGenerationInput, KnowledgeInspirationGenerationInput, RevisionInput, Storyboard, Strategy, StyleSignals, Verification } from "./types";

export interface AIProvider {
  extractProduct(input: AnalysisInput): Promise<AnalysisResult>;
  analyzeReference(input: AnalysisInput): Promise<AnalysisResult>;
  generateTopicStrategies(input: GenerationContext): Promise<Strategy[]>;
  generateCopy(input: GenerationContext, strategy: Strategy): Promise<Draft>;
  reviseCopy(input: RevisionInput): Promise<Draft>;
  verifyCopy(input: GenerationContext, draft: Draft, baseline?: Draft): Promise<Verification>;
  generateInspirations(input: InspirationGenerationInput): Promise<InspirationDraft>;
  generateKnowledgeInspirations(input: KnowledgeInspirationGenerationInput): Promise<InspirationDraft>;
  generateStoryboard(text:string,countryNameEn?:string):Promise<Storyboard>;
  translateMediaQuery(query:string):Promise<string>;
  summarizeStyleChange(original:Draft,adopted:Draft):Promise<StyleSignals>;
}
