CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'local' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`date` text NOT NULL,
	`project` text,
	`content` text NOT NULL,
	`progress` integer,
	`due_date` text,
	`carry_over` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_user_date_idx` ON `entries` (`user_id`,`date`);--> statement-breakpoint
-- Data migration: each log becomes an entry (task title -> project). The latest
-- entry of every task takes the task's progress; unfinished tasks carry over.
INSERT INTO `entries` (`user_id`, `visibility`, `date`, `project`, `content`, `progress`, `due_date`, `carry_over`, `created_at`, `updated_at`)
SELECT `user_id`, `visibility`, `date`, `project`, `content`, `progress`, `due_date`, `carry_over`, `created_at`, `created_at`
FROM (
  SELECT
    l.`user_id` AS `user_id`,
    t.`visibility` AS `visibility`,
    l.`date` AS `date`,
    t.`title` AS `project`,
    l.`content` AS `content`,
    CASE WHEN ROW_NUMBER() OVER (PARTITION BY l.`task_id` ORDER BY l.`date` DESC, l.`id` DESC) = 1
      THEN t.`progress` ELSE l.`progress_after` END AS `progress`,
    t.`due_date` AS `due_date`,
    CASE WHEN ROW_NUMBER() OVER (PARTITION BY l.`task_id` ORDER BY l.`date` DESC, l.`id` DESC) = 1
      AND t.`status` <> 'done' THEN 1 ELSE 0 END AS `carry_over`,
    l.`created_at` AS `created_at`,
    l.`id` AS `log_id`
  FROM `logs` l
  JOIN `tasks` t ON t.`id` = l.`task_id`
)
ORDER BY `log_id`;
--> statement-breakpoint
-- Tasks that never had a log still become one entry so they are not lost.
INSERT INTO `entries` (`user_id`, `visibility`, `date`, `project`, `content`, `progress`, `due_date`, `carry_over`, `created_at`, `updated_at`)
SELECT t.`user_id`, t.`visibility`, substr(t.`created_at`, 1, 10), t.`title`, '（原任務，尚無記事）', t.`progress`, t.`due_date`,
  CASE WHEN t.`status` <> 'done' THEN 1 ELSE 0 END, t.`created_at`, t.`created_at`
FROM `tasks` t
WHERE NOT EXISTS (SELECT 1 FROM `logs` l WHERE l.`task_id` = t.`id`);
