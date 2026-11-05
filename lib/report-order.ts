// Pure helpers (no database), safe to import from client components.

/** "2026/11/13" or "2026-11-13" -> 20261113; anything else -> null. */
function dueKey(s: string): number | null {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s.trim());
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
}

/**
 * Earliest due date first; rows without a (valid) due date go last.
 * The sort is stable, so equal rows keep their current order.
 */
export function sortRowsByDueDate<T extends { dueDate: string }>(
  rows: T[],
): T[] {
  return rows
    .map((row, index) => ({ row, index, key: dueKey(row.dueDate) }))
    .sort((a, b) => {
      if (a.key === b.key) return a.index - b.index;
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      return a.key - b.key;
    })
    .map((x) => x.row);
}
