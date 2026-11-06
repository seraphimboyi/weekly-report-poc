import type { DismissedItem, ReportContent, ThisWeekRow } from "./report";

export type SyncSummary = { added: number; updated: number; removed: number };

type AnyRow = {
  id: string;
  no: number;
  title: string;
  dueDate: string;
  note: string;
  groupKey?: string;
  touched?: string[];
};

/**
 * Merge freshly generated rows into the user's current rows.
 * - Untouched title and note follow the generated (latest) value.
 * - Progress and due date are filled in by hand and never changed by a sync.
 * - Fields the user edited by hand (`touched`) are kept.
 * - Rows the user deleted (`dismissed`) are not added back.
 * - Rows the user added (no groupKey) are kept at the end.
 */
function mergeRows<T extends AnyRow>(
  existing: T[],
  generated: T[],
  dismissed: DismissedItem[],
  fields: string[],
): { rows: T[]; dismissed: DismissedItem[]; summary: SyncSummary } {
  const summary: SyncSummary = { added: 0, updated: 0, removed: 0 };
  const generatedKeys = new Set<string>();
  for (const g of generated) if (g.groupKey) generatedKeys.add(g.groupKey);

  // Rows without a key (older reports): link to a generated row by title once.
  const claimed = new Set<string>();
  for (const e of existing) if (e.groupKey) claimed.add(e.groupKey);
  const rows = existing.map((e) => {
    if (e.groupKey) return e;
    const match = generated.find(
      (g) =>
        g.groupKey && g.title === e.title.trim() && !claimed.has(g.groupKey),
    );
    if (!match?.groupKey) return e;
    claimed.add(match.groupKey);
    const touched = fields.filter(
      (f) =>
        f !== "title" &&
        (e as Record<string, unknown>)[f] !==
          (match as Record<string, unknown>)[f],
    );
    return { ...e, groupKey: match.groupKey, touched };
  });

  const byKey = new Map<string, T>();
  for (const e of rows) if (e.groupKey) byKey.set(e.groupKey, e);
  const dismissedKeys = new Set(dismissed.map((d) => d.groupKey));

  const merged: T[] = [];
  for (const g of generated) {
    const e = g.groupKey ? byKey.get(g.groupKey) : undefined;
    if (e) {
      const touched = e.touched ?? [];
      const next = { ...e } as Record<string, unknown>;
      let changed = false;
      for (const f of fields) {
        if (touched.includes(f)) continue;
        const value = (g as Record<string, unknown>)[f];
        if (next[f] !== value) {
          next[f] = value;
          changed = true;
        }
      }
      if (changed) summary.updated++;
      merged.push(next as T);
    } else if (!g.groupKey || !dismissedKeys.has(g.groupKey)) {
      summary.added++;
      merged.push(g);
    }
  }

  // Rows that no longer exist in the data: drop unless the user edited them.
  for (const e of rows) {
    if (!e.groupKey || generatedKeys.has(e.groupKey)) continue;
    if ((e.touched ?? []).length > 0) merged.push(e);
    else summary.removed++;
  }

  // Manual rows are always kept.
  for (const e of rows) if (!e.groupKey) merged.push(e);

  // Keep the current order (the user sorts by hand); new rows go last.
  const position = new Map<string, number>();
  rows.forEach((r, i) => {
    position.set(r.id, i);
  });
  const ordered = merged
    .map((row, index) => ({
      row,
      index,
      pos: position.get(row.id) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => (a.pos === b.pos ? a.index - b.index : a.pos - b.pos))
    .map((x) => x.row);

  return {
    rows: ordered.map((r, i) => ({ ...r, no: i + 1 })),
    dismissed: dismissed.filter((d) => generatedKeys.has(d.groupKey)),
    summary,
  };
}

export function mergeContent(
  existing: ReportContent,
  generated: ReportContent,
): { content: ReportContent; summary: SyncSummary } {
  const dismissed = existing.dismissed ?? { thisWeek: [], nextWeek: [] };
  const a = mergeRows<ThisWeekRow>(
    existing.thisWeek,
    generated.thisWeek,
    dismissed.thisWeek,
    ["title", "note"],
  );
  return {
    content: {
      weekStart: existing.weekStart,
      weekEnd: existing.weekEnd,
      thisWeek: a.rows,
      // Next week is managed by hand: a sync never adds, changes or removes rows.
      nextWeek: existing.nextWeek,
      dismissed: { thisWeek: a.dismissed, nextWeek: dismissed.nextWeek },
    },
    summary: a.summary,
  };
}

export const hasChanges = (s: SyncSummary) =>
  s.added + s.updated + s.removed > 0;
