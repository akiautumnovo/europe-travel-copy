CREATE UNIQUE INDEX IF NOT EXISTS `content_versions_content_version_unique`
ON `content_versions` (`content_id`, `user_id`, `version_no`);
