import type { AnalysisInput, AnalysisResult } from "./types";

export interface AIProvider {
  extractProduct(input: AnalysisInput): Promise<AnalysisResult>;
  analyzeReference(input: AnalysisInput): Promise<AnalysisResult>;
}

