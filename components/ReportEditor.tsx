"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WeeklyReport } from "@/db/schema";
import { todayString } from "@/lib/date";
import type {
  DismissedItem,
  NextWeekRow,
  ReportContent,
  ThisWeekRow,
} from "@/lib/report";
import { sortRowsByDueDate } from "@/lib/report-order";
import { addDays, getWeekRange, parseIsoDate, toIsoDate } from "@/lib/week";
import { ReportTable } from "./ReportTable";
import { TaskMenu } from "./TaskMenu";
import { useToast } from "./Toast";

type SaveState = "idle" | "saving" | "saved" | "error";
type Summary = { added: number; updated: number; removed: number };
type SyncResult = {
  report: WeeklyReport;
  summary: Summary;
  applied: boolean;
  pending: number;
  created: boolean;
};

const SAVE_DELAY_MS = 800;

const EMPTY_DISMISSED = { thisWeek: [], nextWeek: [] } as {
  thisWeek: DismissedItem[];
  nextWeek: DismissedItem[];
};

const union = (a: string[] | undefined, b: string[]) => [
  ...new Set([...(a ?? []), ...b]),
];

function describe(s: Summary) {
  const parts = [
    s.added && `新增 ${s.added} 列`,
    s.updated && `更新 ${s.updated} 列`,
    s.removed && `移除 ${s.removed} 列`,
  ].filter(Boolean);
  return `已帶入最新資料：${parts.join("、")}`;
}

export function ReportEditor({ date }: { date: string }) {
  const { show } = useToast();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [content, setContent] = useState<ReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pending, setPending] = useState(0);
  const [exporting, setExporting] = useState(false);
  const dirty = useRef(false);
  const reportRef = useRef<WeeklyReport | null>(null);
  const contentRef = useRef<ReportContent | null>(null);

  const applyServer = useCallback((r: WeeklyReport) => {
    dirty.current = false;
    reportRef.current = r;
    const c = JSON.parse(r.content) as ReportContent;
    contentRef.current = c;
    setReport(r);
    setContent(c);
  }, []);

  /** Save unsaved edits right now (used before any sync/apply/export). */
  const flush = useCallback(async () => {
    const r = reportRef.current;
    const c = contentRef.current;
    if (!r || !c || !dirty.current) return true;
    setSaveState("saving");
    const res = await fetch(`/api/reports/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: c }),
    });
    if (!res.ok) {
      setSaveState("error");
      return false;
    }
    dirty.current = false;
    const saved: WeeklyReport = await res.json();
    reportRef.current = saved;
    setReport(saved);
    setSaveState("saved");
    return true;
  }, []);

  /** Open the week: create it if needed and pull in the latest data. */
  const sync = useCallback(
    async (initial: boolean) => {
      if (!(await flush())) return;
      const res = await fetch("/api/reports/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "載入失敗");
        setLoading(false);
        return;
      }
      const result: SyncResult = await res.json();
      // The user kept typing while we waited: keep their version for now.
      if (dirty.current) return;
      setError(null);
      applyServer(result.report);
      setPending(result.pending);
      setLoading(false);
      if (!initial && result.applied) {
        show({ message: describe(result.summary), duration: 4000 });
      }
    },
    [date, flush, applyServer, show],
  );

  useEffect(() => {
    reportRef.current = null;
    contentRef.current = null;
    setReport(null);
    setContent(null);
    setPending(0);
    setLoading(true);
    setSaveState("idle");
    sync(true);
  }, [sync]);

  // Coming back to this tab: pick up logs written elsewhere.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") sync(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  // Leaving or reloading the page: send unsaved edits before the page goes away.
  useEffect(() => {
    const saveBeforeLeaving = () => {
      const r = reportRef.current;
      const c = contentRef.current;
      if (!r || !c || !dirty.current) return;
      void fetch(`/api/reports/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c }),
        keepalive: true,
      });
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") saveBeforeLeaving();
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  // Debounced autosave: only runs after a user edit.
  useEffect(() => {
    if (!content || !dirty.current) return;
    const timer = setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, flush]);

  /**
   * Apply an edit. Typing is saved shortly after the user stops; structural
   * changes (add / delete a row ...) pass `immediate` so they are saved right
   * away and cannot be lost by a quick refresh.
   */
  function edit(next: ReportContent, immediate = false) {
    dirty.current = true;
    contentRef.current = next;
    setSaveState("idle");
    setContent(next);
    if (immediate) void flush();
  }

  async function applyNow(message?: boolean) {
    if (!report || !(await flush())) return;
    const res = await fetch(`/api/reports/${report.id}/apply`, {
      method: "POST",
    });
    if (!res.ok) {
      setError("更新失敗");
      return;
    }
    const result: { report: WeeklyReport; summary: Summary } = await res.json();
    applyServer(result.report);
    setPending(0);
    const s = result.summary;
    if (message && s.added + s.updated + s.removed > 0) {
      show({ message: describe(s), duration: 4000 });
    }
  }

  async function startOver() {
    if (!report) return;
    if (!confirm("從頭重新產生會清除你在這份週報的所有修改，確定嗎？")) return;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, force: true }),
    });
    if (!res.ok) {
      setError("重新產生失敗");
      return;
    }
    applyServer(await res.json());
    setPending(0);
  }

  async function exportDocx() {
    if (!report) return;
    setError(null);
    setExporting(true);
    try {
      if (!(await flush())) throw new Error("儲存失敗，無法匯出");
      const res = await fetch(`/api/reports/${report.id}/export`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "匯出失敗");
      }
      const blob = await res.blob();
      const c = contentRef.current;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `週報_${(c?.weekStart ?? "").replaceAll("/", "")}-${(c?.weekEnd ?? "").replaceAll("/", "")}.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
      // The export may have pulled in newer data; show what was exported.
      const fresh = await fetch(`/api/reports/${report.id}`, {
        cache: "no-store",
      });
      if (fresh.ok) applyServer(await fresh.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "匯出失敗");
    } finally {
      setExporting(false);
    }
  }

  // --- row editing -------------------------------------------------------

  function editRow<K extends "thisWeek" | "nextWeek">(
    table: K,
    id: string,
    patch: Partial<ReportContent[K][number]>,
  ) {
    if (!content) return;
    // Progress and due date are always typed in by hand, so they are not
    // tracked as edits.
    const fields = Object.keys(patch).filter(
      (f) => !["progress", "targetProgress", "dueDate"].includes(f),
    );
    edit({
      ...content,
      [table]: (
        content[table] as {
          id: string;
          groupKey?: string;
          touched?: string[];
        }[]
      ).map((r) =>
        r.id === id
          ? {
              ...r,
              ...patch,
              touched:
                table === "thisWeek" && r.groupKey != null
                  ? union(r.touched, fields)
                  : r.touched,
            }
          : r,
      ),
    } as ReportContent);
  }

  function removeRow(table: "thisWeek" | "nextWeek", id: string) {
    if (!content) return;
    const rows = content[table] as {
      id: string;
      groupKey?: string;
      title: string;
    }[];
    const row = rows.find((r) => r.id === id);
    const dismissed = content.dismissed ?? EMPTY_DISMISSED;
    edit(
      {
        ...content,
        [table]: rows.filter((r) => r.id !== id),
        dismissed: {
          ...dismissed,
          [table]:
            table === "thisWeek" && row?.groupKey != null
              ? [
                  ...dismissed[table],
                  { groupKey: row.groupKey, title: row.title },
                ]
              : dismissed[table],
        },
      } as ReportContent,
      true,
    );
  }

  // A next-week row copied from a this-week row remembers where it came from.
  const linkKey = (row: { id: string; groupKey?: string }) =>
    row.groupKey ?? `m:${row.id}`;

  function isInNext(row: ThisWeekRow) {
    return !!content?.nextWeek.some((n) => n.groupKey === linkKey(row));
  }

  /** Copy a this-week row into the next-week table (name and due date only). */
  function addToNext(row: ThisWeekRow) {
    if (!content || isInNext(row)) return;
    const added: NextWeekRow = {
      id: crypto.randomUUID(),
      groupKey: linkKey(row),
      touched: [],
      no: 0,
      title: row.title,
      targetProgress: "",
      dueDate: row.dueDate,
      note: "",
    };
    edit(
      {
        ...content,
        nextWeek: sortRowsByDueDate([...content.nextWeek, added]),
      },
      true,
    );
    show({
      message: "已新增至下週工作項目（已帶入名稱與預計完成日）",
      duration: 3500,
    });
  }

  /** After a due date is entered, put the table back in due-date order. */
  function sortTable(table: "thisWeek" | "nextWeek") {
    if (!content) return;
    const rows = content[table] as { id: string; dueDate: string }[];
    const sorted = sortRowsByDueDate(rows);
    if (sorted.every((r, i) => r.id === rows[i].id)) return;
    edit({ ...content, [table]: sorted } as ReportContent);
  }

  function resetRow(table: "thisWeek" | "nextWeek", id: string) {
    if (!content) return;
    edit({
      ...content,
      [table]: (content[table] as { id: string; touched?: string[] }[]).map(
        (r) => (r.id === id ? { ...r, touched: [] } : r),
      ),
    } as ReportContent);
    void applyNow(false);
  }

  function restoreRow(table: "thisWeek" | "nextWeek", groupKey: string) {
    if (!content) return;
    const dismissed = content.dismissed ?? EMPTY_DISMISSED;
    edit({
      ...content,
      dismissed: {
        ...dismissed,
        [table]: dismissed[table].filter((d) => d.groupKey !== groupKey),
      },
    });
    void applyNow(false);
  }

  const today = todayString();
  const current = parseIsoDate(date);
  const prev = toIsoDate(addDays(current, -7));
  const next = toIsoDate(addDays(current, 7));
  const canGoNext =
    toIsoDate(getWeekRange(parseIsoDate(next)).start) <=
    toIsoDate(getWeekRange(parseIsoDate(today)).start);
  const isThisWeek =
    toIsoDate(getWeekRange(current).start) ===
    toIsoDate(getWeekRange(parseIsoDate(today)).start);

  const navLink =
    "rounded-md px-3 py-1 text-muted transition-colors hover:bg-slate-100 hover:text-ink";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">週報</h1>
        <nav
          aria-label="切換週次"
          className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm"
        >
          <Link href={`/report?date=${prev}`} className={navLink}>
            ← 上一週
          </Link>
          <Link
            href="/report"
            className={`${navLink} ${isThisWeek ? "bg-brand-soft text-brand" : ""}`}
          >
            本週
          </Link>
          {canGoNext ? (
            <Link href={`/report?date=${next}`} className={navLink}>
              下一週 →
            </Link>
          ) : (
            <span className="cursor-not-allowed px-3 py-1 text-muted/40">
              下一週 →
            </span>
          )}
        </nav>
      </div>

      {loading && <p className="text-muted">載入最新資料中…</p>}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {pending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm">
          <span>這份週報之後有 {pending} 項新的更新（記事）。</span>
          <button
            type="button"
            onClick={() => applyNow(true)}
            className="btn btn-primary"
          >
            套用更新
          </button>
        </div>
      )}

      {report && content && (
        <>
          <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-muted">工作區間</p>
              <p className="text-lg font-semibold tabular-nums">
                {content.weekStart} – {content.weekEnd}
              </p>
              {isThisWeek && (
                <p className="mt-1 text-xs text-muted">
                  內容會依最新的記事自動更新；你修改過的欄位、填寫的進度和預計完成日不會被覆蓋。
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <output className="mr-1 min-w-20 text-sm text-muted sm:text-right">
                {saveState === "saving" && "儲存中…"}
                {saveState === "saved" && "已自動儲存"}
                {saveState === "error" && (
                  <span className="text-danger">儲存失敗</span>
                )}
              </output>
              <span
                className={`badge ${report.status === "exported" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
              >
                {report.status === "exported" ? "已匯出" : "草稿"}
              </span>
              <button
                type="button"
                onClick={exportDocx}
                disabled={exporting}
                className="btn btn-primary"
              >
                {exporting ? "匯出中…" : "匯出 Word"}
              </button>
              <TaskMenu
                items={[
                  {
                    label: "從頭重新產生",
                    danger: true,
                    onSelect: startOver,
                  },
                ]}
              />
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">一、本週工作項目</h2>
            <p className="-mt-1 text-xs text-muted">
              按每列下方的「新增至下週工作項目」，會把名稱和預計完成日帶到下週表；預計達成進度和備註請到下週表填寫。
            </p>
            <ReportTable<ThisWeekRow>
              rows={content.thisWeek}
              progressKey="progress"
              progressLabel="目前進度"
              emptyText="沒有項目。有新的記事時會自動帶入，也可以按下方「新增一列」。"
              addToNext={{ isAdded: isInNext, onAdd: addToNext }}
              dismissed={content.dismissed?.thisWeek ?? []}
              onEdit={(id, patch) => editRow("thisWeek", id, patch)}
              onRemove={(id) => removeRow("thisWeek", id)}
              onDueDateCommit={() => sortTable("thisWeek")}
              onReset={(id) => resetRow("thisWeek", id)}
              onRestore={(groupKey) => restoreRow("thisWeek", groupKey)}
              onAdd={() =>
                edit(
                  {
                    ...content,
                    thisWeek: [
                      ...content.thisWeek,
                      {
                        id: crypto.randomUUID(),
                        no: 0,
                        title: "",
                        progress: "",
                        dueDate: "",
                        note: "",
                      },
                    ],
                  },
                  true,
                )
              }
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">二、下週預計工作項目</h2>
            <ReportTable<NextWeekRow>
              rows={content.nextWeek}
              progressKey="targetProgress"
              progressLabel="預計達成進度"
              emptyText="沒有項目。按本週工作項目下方的「新增至下週工作項目」加入，也可以按下方「新增一列」。"
              onEdit={(id, patch) => editRow("nextWeek", id, patch)}
              onRemove={(id) => removeRow("nextWeek", id)}
              onDueDateCommit={() => sortTable("nextWeek")}
              onAdd={() =>
                edit(
                  {
                    ...content,
                    nextWeek: [
                      ...content.nextWeek,
                      {
                        id: crypto.randomUUID(),
                        no: 0,
                        title: "",
                        targetProgress: "",
                        dueDate: "",
                        note: "",
                      },
                    ],
                  },
                  true,
                )
              }
            />
          </section>
        </>
      )}
    </div>
  );
}
