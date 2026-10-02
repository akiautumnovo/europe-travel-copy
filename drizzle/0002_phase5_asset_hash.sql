ALTER TABLE `assets` ADD `content_hash` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_user_content_hash_unique` ON `assets` (`user_id`,`content_hash`);
