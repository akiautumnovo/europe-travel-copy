import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), email: text("email").notNull(), onboarding: text("onboarding").notNull().default("{}"), settings: text("settings").notNull().default("{}"), ...timestamps,
});
export const products = sqliteTable("products", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(), status: text("status").notNull().default("normal"), sourceType: text("source_type").notNull().default("manual"), rawContent: text("raw_content").notNull().default(""), sourceFilePath: text("source_file_path"), facts: text("facts").notNull().default("{}"), aiAnalysis: text("ai_analysis").notNull().default("{}"), ...timestamps,
});
export const contents = sqliteTable("contents", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), productId: text("product_id"), topicTitle: text("topic_title").notNull(), topicMeta: text("topic_meta").notNull().default("{}"), sourceInput: text("source_input").notNull().default(""), salesIntensity: integer("sales_intensity").notNull().default(1), status: text("status").notNull().default("draft"), productSnapshot: text("product_snapshot").notNull().default("{}"), fingerprint: text("fingerprint").notNull().default("{}"), ...timestamps,
});
export const contentVersions = sqliteTable("content_versions", {
  id: text("id").primaryKey(), contentId: text("content_id").notNull(), userId: text("user_id").notNull(), versionNo: integer("version_no").notNull(), strategyType: text("strategy_type").notNull(), textContent: text("text_content").notNull(), blocks: text("blocks").notNull().default("[]"), lockedBlockIds: text("locked_block_ids").notNull().default("[]"), changeType: text("change_type"), changeInstruction: text("change_instruction"), isAdopted: integer("is_adopted", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull(),
});
export const styleDna = sqliteTable("style_dna", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().unique(), stablePreferences: text("stable_preferences").notNull().default("[]"), candidatePreferences: text("candidate_preferences").notNull().default("[]"), negativePreferences: text("negative_preferences").notNull().default("[]"), evidenceSummary: text("evidence_summary").notNull().default("{}"), updatedAt: text("updated_at").notNull(),
});
export const factCache = sqliteTable("fact_cache", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), queryKey: text("query_key").notNull(), claim: text("claim").notNull(), sources: text("sources").notNull().default("[]"), verificationLevel: text("verification_level").notNull(), status: text("status").notNull(), verifiedAt: text("verified_at").notNull(), expiresAt: text("expires_at"), createdAt: text("created_at").notNull(),
});
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), assetType: text("asset_type").notNull(), storagePath: text("storage_path"), externalUrl: text("external_url"), sourceName: text("source_name").notNull(), author: text("author"), sourceUrl: text("source_url"), licenseStatus: text("license_status").notNull().default("owned"), riskLevel: text("risk_level").notNull().default("green"), tags: text("tags").notNull().default("[]"), metadata: text("metadata").notNull().default("{}"), contentHash:text("content_hash"), createdAt: text("created_at").notNull(),
});
