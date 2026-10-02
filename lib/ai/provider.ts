import type { AnalysisInput, AnalysisResult, Draft, GenerationContext, RevisionInput, Strategy, Verification } from "./types";

export interface AIProvider {
  extractProduct(input: AnalysisInput): Promise<AnalysisResult>;
  analyzeReference(input: AnalysisInput): Promise<AnalysisResult>;
  generateTopicStrategies(input: GenerationContext): Promise<Strategy[]>;
  generateCopy(input: GenerationContext, strategy: Strategy): Promise<Draft>;
  reviseCopy(input: RevisionInput): Promise<Draft>;
  verifyCopy(input: GenerationContext, draft: Draft, baseline?: Draft): Promise<Verification>;
}
