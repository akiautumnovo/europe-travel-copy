CREATE TABLE `profiles` (`id` text PRIMARY KEY NOT NULL, `email` text NOT NULL, `onboarding` text DEFAULT '{}' NOT NULL, `settings` text DEFAULT '{}' NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `products` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `name` text NOT NULL, `status` text DEFAULT 'normal' NOT NULL, `source_type` text DEFAULT 'manual' NOT NULL, `raw_content` text DEFAULT '' NOT NULL, `source_file_path` text, `facts` text DEFAULT '{}' NOT NULL, `ai_analysis` text DEFAULT '{}' NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_products_user_updated` ON `products` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `contents` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `product_id` text, `topic_title` text NOT NULL, `topic_meta` text DEFAULT '{}' NOT NULL, `source_input` text DEFAULT '' NOT NULL, `sales_intensity` integer DEFAULT 1 NOT NULL, `status` text DEFAULT 'draft' NOT NULL, `product_snapshot` text DEFAULT '{}' NOT NULL, `fingerprint` text DEFAULT '{}' NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_contents_user_created` ON `contents` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `content_versions` (`id` text PRIMARY KEY NOT NULL, `content_id` text NOT NULL, `user_id` text NOT NULL, `version_no` integer NOT NULL, `strategy_type` text NOT NULL, `text_content` text NOT NULL, `blocks` text DEFAULT '[]' NOT NULL, `locked_block_ids` text DEFAULT '[]' NOT NULL, `change_type` text, `change_instruction` text, `is_adopted` integer DEFAULT false NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_versions_content` ON `content_versions` (`content_id`,`version_no`);
--> statement-breakpoint
CREATE TABLE `style_dna` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL UNIQUE, `stable_preferences` text DEFAULT '[]' NOT NULL, `candidate_preferences` text DEFAULT '[]' NOT NULL, `negative_preferences` text DEFAULT '[]' NOT NULL, `evidence_summary` text DEFAULT '{}' NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `fact_cache` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `query_key` text NOT NULL, `claim` text NOT NULL, `sources` text DEFAULT '[]' NOT NULL, `verification_level` text NOT NULL, `status` text NOT NULL, `verified_at` text NOT NULL, `expires_at` text, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_fact_cache_user_query` ON `fact_cache` (`user_id`,`query_key`);
--> statement-breakpoint
CREATE TABLE `assets` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `asset_type` text NOT NULL, `storage_path` text, `external_url` text, `source_name` text NOT NULL, `author` text, `source_url` text, `license_status` text DEFAULT 'owned' NOT NULL, `risk_level` text DEFAULT 'green' NOT NULL, `tags` text DEFAULT '[]' NOT NULL, `metadata` text DEFAULT '{}' NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_assets_user_created` ON `assets` (`user_id`,`created_at`);
