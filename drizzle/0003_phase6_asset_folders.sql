CREATE TABLE `asset_folders` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `name` text NOT NULL, `parent_id` text, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_asset_folders_user_parent` ON `asset_folders` (`user_id`,`parent_id`);
--> statement-breakpoint
ALTER TABLE `assets` ADD COLUMN `folder_id` text;
--> statement-breakpoint
CREATE INDEX `idx_assets_user_folder` ON `assets` (`user_id`,`folder_id`);
