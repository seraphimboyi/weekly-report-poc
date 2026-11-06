import { and, between, eq } from "drizzle-orm";
import { db } from "@/db";
import { type Entry, entries } from "@/db/schema";
import { DEFAULT_USER_ID } from "./config";
import { isWeekend, parseIsoDate, toIsoDate, toSlashDate } from "./week";

/**
 * Rows built from notes carry `groupKey` (the work item, or one single note),
 * so they can follow the latest data. `touched` lists fields the user edited
 * by hand; those are never overwritten by a sync. Rows without `groupKey`
 * were added by the user and are kept as is. The Word template ignores these
 * extra fields. `taskId` only exists in reports saved before notes replaced
 * tasks; it is converted to `groupKey` when a report is loaded.
 */
type RowMeta = { groupKey?: string; touched?: string[]; taskId?: number };

export type ThisWeekRow = RowMeta & {
  id: string;
  no: number;
  title: string;
  progress: string;
  dueDate: string;
  note: string;
};

export type NextWeekRow = RowMeta & {
  id: string;
  no: number;
  title: string;
  targetProgress: string;
  dueDate: string;
  note: string;
};

/** A generated row the user deleted; sync will not add it back. */
export type DismissedItem = {
  groupKey: string;
  title: string;
  taskId?: number;
};

export type ReportContent = {
  weekStart: string;
  weekEnd: string;
  thisWeek: ThisWeekRow[];
  nextWeek: NextWeekRow[];
  dismissed?: { thisWeek: DismissedItem[]; nextWeek: DismissedItem[] };
};

type Group = {
  key: string;
  title: string;
  note: string;
  firstId: number;
  /** This week's notes of the item, oldest first (project-less: just one). */
  items: Entry[];
};

const firstLine = (s: string) => s.split("\n")[0].trim();

/**
 * Note text for a work item: every note of the week, one per line, oldest
 * first. When the notes span several days, the first note of each day gets a
 * "MM/DD " prefix; with a single day there is no prefix.
 */
function buildNote(all: Entry[]): string {
  // A note is optional: entries without text add nothing to the report note.
  const items = all.filter((e) => e.content.trim() !== "");
  const multiDay = new Set(items.map((e) => e.date)).size > 1;
  let lastDate = "";
  return items
    .map((e) => {
      const prefix =
        multiDay && e.date !== lastDate
          ? `${toSlashDate(e.date).slice(5)} `
          : "";
      lastDate = e.date;
      return `${prefix}${e.content}`;
    })
    .join("\n");
}

/**
 * Build the report from notes (no LLM). Notes of the report week (no weekend) that
 * share a work item merge into one row; a note without a work item is a row
 * of its own. Progress and due date are never taken from notes: they are
 * left blank and filled in by hand on the report page. The note lists all of the item's
 * notes this week. The next-week table starts empty.
 */
export function generateDraft(weekStart: Date, weekEnd: Date): ReportContent {
  const startIso = toIsoDate(weekStart);
  const endIso = toIsoDate(weekEnd);

  // This week's notes (weekend days excluded), oldest first.
  const weekEntries: Entry[] = db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, DEFAULT_USER_ID),
        between(entries.date, startIso, endIso),
      ),
    )
    .orderBy(entries.date, entries.id)
    .all()
    .filter((e) => !isWeekend(parseIsoDate(e.date)));
  const groups = new Map<string, Group>();
  for (const e of weekEntries) {
    const key = e.project ? `p:${e.project}` : `e:${e.id}`;
    const items = [...(groups.get(key)?.items ?? []), e];
    groups.set(key, {
      key,
      items,
      title: e.project ?? firstLine(e.content),
      note: e.project ? buildNote(items) : "",
      firstId: groups.get(key)?.firstId ?? e.id,
    });
  }

  // Order of first appearance; due dates are blank until filled in by hand.
  const sorted = [...groups.values()].sort((a, b) => a.firstId - b.firstId);

  return {
    weekStart: toSlashDate(startIso),
    weekEnd: toSlashDate(endIso),
    dismissed: { thisWeek: [], nextWeek: [] },
    thisWeek: sorted.map((g, i) => ({
      id: crypto.randomUUID(),
      groupKey: g.key,
      touched: [],
      no: i + 1,
      title: g.title,
      progress: "", // filled in by hand on the report page
      dueDate: "", // filled in by hand on the report page
      note: g.note,
    })),
    // The next-week table is managed by hand on the report page.
    nextWeek: [],
  };
}

/** Re-number rows by order so `no` always matches position. */
export function renumber(content: ReportContent): ReportContent {
  return {
    ...content,
    thisWeek: content.thisWeek.map((r, i) => ({ ...r, no: i + 1 })),
    nextWeek: content.nextWeek.map((r, i) => ({ ...r, no: i + 1 })),
  };
}
