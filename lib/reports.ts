import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, type WeeklyReport, weeklyReports } from "@/db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "./api";
import { DEFAULT_USER_ID } from "./config";
import { todayString } from "./date";
import { generateDraft, type ReportContent, renumber } from "./report";
import { hasChanges, mergeContent, type SyncSummary } from "./report-sync";
import { getWeekRange, parseIsoDate, toIsoDate, toSlashDate } from "./week";

const nowIso = () => new Date().toISOString();

/** The work week containing a date, plus its stored key (YYYY/MM/DD Monday). */
function weekOf(dateIso: string) {
  const { start, end } = getWeekRange(parseIsoDate(dateIso));
  return { start, end, key: toSlashDate(toIsoDate(start)) };
}

/**
 * Load a report's content. Reports saved when tasks existed reference rows by
 * `taskId`; convert them to the work-item key (the task title became the
 * project name when old data was migrated to notes).
 */
export function parseContent(report: WeeklyReport): ReportContent {
  const c = JSON.parse(report.content) as ReportContent;
  const dismissed = c.dismissed ?? { thisWeek: [], nextWeek: [] };

  const legacy = (r: { taskId?: number; groupKey?: string }) =>
    r.taskId != null && !r.groupKey;
  const needsLookup =
    c.thisWeek.some(legacy) ||
    c.nextWeek.some(legacy) ||
    dismissed.thisWeek.some(legacy) ||
    dismissed.nextWeek.some(legacy);
  if (!needsLookup) return { ...c, dismissed };

  const titles = new Map(
    db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .all()
      .map((t) => [t.id, t.title]),
  );
  const keyOf = (taskId?: number) => {
    const title = taskId != null ? titles.get(taskId) : undefined;
    return title ? `p:${title}` : undefined;
  };
  const fixRow = <R extends { taskId?: number; groupKey?: string }>(
    r: R,
  ): R => {
    if (!legacy(r)) return r;
    const { taskId, ...rest } = r;
    return { ...rest, groupKey: keyOf(taskId) } as R;
  };
  const fixDismissed = (list: typeof dismissed.thisWeek) =>
    list.flatMap((d) => {
      const groupKey = d.groupKey ?? keyOf(d.taskId);
      return groupKey ? [{ groupKey, title: d.title }] : [];
    });
  return {
    ...c,
    thisWeek: c.thisWeek.map(fixRow),
    nextWeek: c.nextWeek.map(fixRow),
    dismissed: {
      thisWeek: fixDismissed(dismissed.thisWeek),
      nextWeek: fixDismissed(dismissed.nextWeek),
    },
  };
}

/** Only the current week follows the latest data automatically. */
export function isCurrentWeek(report: WeeklyReport): boolean {
  return report.weekStart === weekOf(todayString()).key;
}

/** Reports leave this module with legacy rows already converted. */
const normalized = (r: WeeklyReport): WeeklyReport => ({
  ...r,
  content: JSON.stringify(parseContent(r)),
});

export function findReport(dateIso: string): WeeklyReport | null {
  const { key } = weekOf(dateIso);
  const r = db
    .select()
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.userId, DEFAULT_USER_ID),
        eq(weeklyReports.weekStart, key),
      ),
    )
    .get();
  return r ? normalized(r) : null;
}

export function getReport(id: number): WeeklyReport {
  const r = db
    .select()
    .from(weeklyReports)
    .where(
      and(eq(weeklyReports.id, id), eq(weeklyReports.userId, DEFAULT_USER_ID)),
    )
    .get();
  if (!r) throw new NotFoundError("找不到此週報");
  return normalized(r);
}

function insertReport(content: ReportContent): WeeklyReport {
  return normalized(
    db
      .insert(weeklyReports)
      .values({
        userId: DEFAULT_USER_ID,
        weekStart: content.weekStart,
        weekEnd: content.weekEnd,
        content: JSON.stringify(content),
      })
      .returning()
      .get(),
  );
}

function writeContent(id: number, content: ReportContent): WeeklyReport {
  return normalized(
    db
      .update(weeklyReports)
      .set({
        content: JSON.stringify(content),
        status: "draft",
        exportedAt: null,
        updatedAt: nowIso(),
      })
      .where(eq(weeklyReports.id, id))
      .returning()
      .get(),
  );
}

/** Start over from the latest data, discarding every manual edit. */
export function createReport(dateIso: string, force: boolean): WeeklyReport {
  const existing = findReport(dateIso);
  if (existing && !force) {
    throw new ConflictError("此週已有週報，如要重新產生請使用 force");
  }
  const { start, end } = weekOf(dateIso);
  const content = generateDraft(start, end);
  return existing ? writeContent(existing.id, content) : insertReport(content);
}

/** Save edits from the preview page; editing an exported report reopens it. */
export function saveReportContent(
  id: number,
  content: ReportContent,
): WeeklyReport {
  const current = getReport(id);
  return writeContent(
    id,
    renumber({
      ...content,
      // Week range is fixed by the report itself.
      weekStart: current.weekStart,
      weekEnd: current.weekEnd,
    }),
  );
}

function mergeLatest(report: WeeklyReport) {
  const content = parseContent(report);
  const { start, end } = getWeekRange(
    parseIsoDate(content.weekStart.replaceAll("/", "-")),
  );
  return mergeContent(content, generateDraft(start, end));
}

/** Pull the latest tasks and logs into a report and save it. */
export function applyLatest(id: number): {
  report: WeeklyReport;
  summary: SyncSummary;
} {
  const report = getReport(id);
  const { content, summary } = mergeLatest(report);
  if (hasChanges(summary)) {
    return { report: writeContent(id, content), summary };
  }
  // Nothing visible changed, but "removed rows" that no longer exist in the
  // data must be forgotten: otherwise a new note for the same work item would
  // stay hidden. Save that quietly, without reopening an exported report.
  const before = JSON.stringify(parseContent(report).dismissed);
  if (JSON.stringify(content.dismissed) !== before) {
    const saved = db
      .update(weeklyReports)
      .set({ content: JSON.stringify(content), updatedAt: nowIso() })
      .where(eq(weeklyReports.id, id))
      .returning()
      .get();
    return { report: normalized(saved), summary };
  }
  return { report, summary };
}

export type SyncResult = {
  report: WeeklyReport;
  summary: SyncSummary;
  /** Updates were saved into the report just now. */
  applied: boolean;
  /** Number of available updates that were NOT applied (non-current weeks). */
  pending: number;
  created: boolean;
};

/**
 * Open a week's report: create it if missing, and for the current week keep
 * it in line with the latest tasks and logs. Other weeks only report how many
 * updates are available.
 */
export function syncReport(dateIso: string): SyncResult {
  const { start, key } = weekOf(dateIso);
  if (start.getTime() > weekOf(todayString()).start.getTime()) {
    throw new BadRequestError("還沒到的週次無法產生週報");
  }

  const existing = findReport(dateIso);
  const none: SyncSummary = { added: 0, updated: 0, removed: 0 };
  if (!existing) {
    const report = createReport(dateIso, false);
    return { report, summary: none, applied: false, pending: 0, created: true };
  }

  if (key === weekOf(todayString()).key) {
    const { report, summary } = applyLatest(existing.id);
    return {
      report,
      summary,
      applied: hasChanges(summary),
      pending: 0,
      created: false,
    };
  }

  const { summary } = mergeLatest(existing);
  return {
    report: existing,
    summary: none,
    applied: false,
    pending: summary.added + summary.updated + summary.removed,
    created: false,
  };
}

export function markExported(id: number): WeeklyReport {
  getReport(id);
  const now = nowIso();
  return normalized(
    db
      .update(weeklyReports)
      .set({ status: "exported", exportedAt: now, updatedAt: now })
      .where(eq(weeklyReports.id, id))
      .returning()
      .get(),
  );
}
