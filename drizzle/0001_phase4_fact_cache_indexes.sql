CREATE INDEX IF NOT EXISTS `fact_cache_user_query_expiry_idx` ON `fact_cache` (`user_id`, `query_key`, `expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contents_user_created_idx` ON `contents` (`user_id`, `created_at`);
