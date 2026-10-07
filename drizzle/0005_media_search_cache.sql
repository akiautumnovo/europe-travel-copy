CREATE TABLE `media_search_cache` (
  `cache_key` text PRIMARY KEY NOT NULL,
  `payload` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_search_cache_expires_idx` ON `media_search_cache` (`expires_at`);

