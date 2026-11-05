CREATE TABLE `weekly_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'local' NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`exported_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reports_user_week_idx` ON `weekly_reports` (`user_id`,`week_start`);