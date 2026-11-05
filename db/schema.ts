import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const TASK_STATUSES = ["in_progress", "done", "paused"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Legacy: replaced by `entries`. Kept so old data and old report rows can be
// resolved; the UI and API no longer use these two tables.
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().default("local"),
  visibility: text("visibility").notNull().default("private"),
  title: text("title").notNull(),
  progress: integer("progress").notNull().default(0),
  dueDate: text("due_date"),
  status: text("status", { enum: TASK_STATUSES })
    .notNull()
    .default("in_progress"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const logs = sqliteTable(
  "logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("local"),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    content: text("content").notNull(),
    progressAfter: integer("progress_after"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("logs_task_date_idx").on(t.taskId, t.date)],
);

export type Task = typeof tasks.$inferSelect;
export type Log = typeof logs.$inferSelect;

export const REPORT_STATUSES = ["draft", "exported"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const weeklyReports = sqliteTable(
  "weekly_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("local"),
    weekStart: text("week_start").notNull(),
    weekEnd: text("week_end").notNull(),
    // JSON string of ReportContent (see lib/report.ts)
    content: text("content").notNull(),
    status: text("status", { enum: REPORT_STATUSES })
      .notNull()
      .default("draft"),
    exportedAt: text("exported_at"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("weekly_reports_user_week_idx").on(t.userId, t.weekStart),
  ],
);

export type WeeklyReport = typeof weeklyReports.$inferSelect;

/** A daily note. Notes sharing a `project` are merged into one report row. */
export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("local"),
    visibility: text("visibility").notNull().default("private"),
    date: text("date").notNull(), // YYYY-MM-DD
    project: text("project"), // optional work item name
    content: text("content").notNull(),
    progress: integer("progress"), // legacy: unused (progress is set on the report page)
    dueDate: text("due_date"), // legacy: unused (due date is set on the report page)
    carryOver: integer("carry_over", { mode: "boolean" })
      .notNull()
      .default(false), // legacy: unused (next week is managed on the report page)
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("entries_user_date_idx").on(t.userId, t.date)],
);

export type Entry = typeof entries.$inferSelect;
