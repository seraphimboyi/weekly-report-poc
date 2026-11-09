import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD");

export const idSchema = z.coerce.number().int().positive();

// --- entries ---------------------------------------------------------------

// The work item is required; the note is optional (may be empty).
const projectName = z
  .string({ error: "請填寫工作項目" })
  .trim()
  .min(1, "請填寫工作項目")
  .max(200, "工作項目最多 200 字");
const noteText = z.string().trim().max(2000, "備註最多 2000 字");

export const createEntrySchema = z.object({
  date: dateString,
  project: projectName,
  content: noteText.optional().default(""),
});

export const updateEntrySchema = z
  .object({
    date: dateString,
    project: projectName,
    content: noteText,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "至少需提供一個欄位");

export const listEntriesQuerySchema = z.object({ date: dateString.optional() });

// --- review (LLM chat) ------------------------------------------------------

export const chatReviewSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});

// --- favorites ---------------------------------------------------------------

export const createFavoriteSchema = z.object({ name: projectName });

// Rename (`name`) or reorder (`move`); exactly one of them.
export const updateFavoriteSchema = z
  .object({
    name: projectName,
    move: z.enum(["up", "down"]),
  })
  .partial()
  .refine(
    (v) => (v.name !== undefined) !== (v.move !== undefined),
    "請擇一提供 name 或 move",
  );

// --- weekly reports ----------------------------------------------------------

const row = {
  groupKey: z.string().max(400).optional(),
  touched: z.array(z.string().max(32)).max(10).optional(),
  id: z.string().min(1).max(64),
  no: z.number().int(),
  title: z.string().max(500),
  dueDate: z.string().max(10),
  note: z.string().max(5000),
};

const dismissedItem = z.object({
  groupKey: z.string().max(400),
  title: z.string().max(500),
});

export const reportContentSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  thisWeek: z
    .array(z.object({ ...row, progress: z.string().max(10) }))
    .max(200),
  nextWeek: z
    .array(z.object({ ...row, targetProgress: z.string().max(10) }))
    .max(200),
  dismissed: z
    .object({
      thisWeek: z.array(dismissedItem).max(200),
      nextWeek: z.array(dismissedItem).max(200),
    })
    .optional(),
});

export const createReportSchema = z.object({
  date: dateString.optional(),
  force: z.boolean().optional(),
});

export const getReportQuerySchema = z.object({ date: dateString.optional() });

export const updateReportSchema = z.object({ content: reportContentSchema });

export const syncReportSchema = z.object({ date: dateString.optional() });
