import { and, between, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type Entry, entries } from "@/db/schema";
import { NotFoundError } from "./api";
import { DEFAULT_USER_ID } from "./config";
import { addDays, getWeekRange, parseIsoDate, toIsoDate } from "./week";

const nowIso = () => new Date().toISOString();

/** Monday..Sunday of the week containing `dateIso` (weekend entries still load). */
export function weekRange(dateIso: string) {
  const { start } = getWeekRange(parseIsoDate(dateIso));
  return { start: toIsoDate(start), end: toIsoDate(addDays(start, 6)) };
}

export function listEntries(startIso: string, endIso: string): Entry[] {
  return db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, DEFAULT_USER_ID),
        between(entries.date, startIso, endIso),
      ),
    )
    .orderBy(entries.date, entries.id)
    .all();
}

export function getEntry(id: number): Entry {
  const e = db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, DEFAULT_USER_ID)))
    .get();
  if (!e) throw new NotFoundError("找不到此記事");
  return e;
}

export function createEntry(input: {
  date: string;
  project: string;
  content?: string;
}): Entry {
  return db
    .insert(entries)
    .values({
      userId: DEFAULT_USER_ID,
      date: input.date,
      content: input.content ?? "",
      project: input.project,
    })
    .returning()
    .get();
}

export function updateEntry(
  id: number,
  input: Partial<{
    date: string;
    content: string;
    project: string;
  }>,
): Entry {
  getEntry(id);
  return db
    .update(entries)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(entries.id, id))
    .returning()
    .get();
}

export function deleteEntry(id: number): void {
  getEntry(id);
  db.delete(entries).where(eq(entries.id, id)).run();
}

export type ProjectInfo = {
  project: string;
  lastDate: string;
};

/** Recently used project names, newest first, with their latest values. */
export function listProjects(limit = 50): ProjectInfo[] {
  const rows = db
    .select()
    .from(entries)
    .where(eq(entries.userId, DEFAULT_USER_ID))
    .orderBy(desc(entries.date), desc(entries.id))
    .all();
  const map = new Map<string, ProjectInfo>();
  for (const e of rows) {
    if (!e.project) continue;
    let info = map.get(e.project);
    if (!info) {
      if (map.size >= limit) continue;
      info = {
        project: e.project,
        lastDate: e.date,
      };
      map.set(e.project, info);
    }
  }
  return [...map.values()];
}
