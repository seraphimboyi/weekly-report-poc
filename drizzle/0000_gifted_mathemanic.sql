CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'local' NOT NULL,
	`task_id` integer NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`progress_after` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `logs_task_date_idx` ON `logs` (`task_id`,`date`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'local' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`title` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
