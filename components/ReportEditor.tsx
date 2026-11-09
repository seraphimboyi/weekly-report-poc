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
import {
  addDays,
  getWeekRange,
  isWeekend,
  parseIsoDate,
  toIsoDate,
} from "@/lib/week";
import { ConfirmDialog } from "./ConfirmDialog";
import { InfoTip } from "./InfoTip";
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

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

const SAVE_DELAY_MS = 800;

const SORT_BTN = "btn btn-ghost min-h-8 px-2 py-1 text-xs hover:bg-slate-100";

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
  const toast = useToast();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [content, setContent] = useState<ReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pending, setPending] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
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
        toast.success(describe(result.summary));
      }
    },
    [date, flush, applyServer, toast],
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

  /**
   * Pull the latest entries into this report. `showSummary` reports what the
   * sync changed; `doneMessage` replaces it with a fixed message (used by
   * restore / reset, where the user's own action is what they want confirmed).
   */
  async function applyNow(showSummary: boolean, doneMessage?: string) {
    if (!report || !(await flush())) return;
    const res = await fetch(`/api/reports/${report.id}/apply`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("套用更新失敗，請再試一次");
      return;
    }
    const result: { report: WeeklyReport; summary: Summary } = await res.json();
    applyServer(result.report);
    setPending(0);
    const s = result.summary;
    if (doneMessage) toast.success(doneMessage);
    else if (showSummary && s.added + s.updated + s.removed > 0) {
      toast.success(describe(s));
    }
  }

  async function startOver() {
    if (!report || resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, force: true }),
      });
      if (!res.ok) {
        toast.error("重新產生週報失敗，請再試一次");
        return;
      }
      applyServer(await res.json());
      setPending(0);
      toast.success("已重新產生週報");
    } catch {
      toast.error("重新產生週報失敗，請檢查網路後再試一次");
    } finally {
      setResetting(false);
      setConfirmingReset(false);
    }
  }

  async function exportDocx() {
    if (!report) return;
    setExporting(true);
    try {
      if (!(await flush())) throw new Error("儲存失敗，無法匯出週報");
      const res = await fetch(`/api/reports/${report.id}/export`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "匯出週報失敗");
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
      toast.success("已匯出週報");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "匯出週報失敗");
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
    toast.success("已刪除一列");
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
        nextWeek: [...content.nextWeek, added],
      },
      true,
    );
    toast.success("已新增至下週工作項目（已帶入名稱與預計完成日）");
  }

  /** Manual action: put a table in due-date order and save right away. */
  function sortTable(table: "thisWeek" | "nextWeek") {
    if (!content) return;
    const rows = content[table] as { id: string; dueDate: string }[];
    const sorted = sortRowsByDueDate(rows);
    if (sorted.every((r, i) => r.id === rows[i].id)) {
      toast.success("順序已是依預計完成日排列");
      return;
    }
    edit(
      {
        ...content,
        [table]: sorted.map((r, i) => ({ ...r, no: i + 1 })),
      } as ReportContent,
      true,
    );
    toast.success("已依預計完成日排序");
  }

  function resetRow(table: "thisWeek" | "nextWeek", id: string) {
    if (!content) return;
    edit({
      ...content,
      [table]: (content[table] as { id: string; touched?: string[] }[]).map(
        (r) => (r.id === id ? { ...r, touched: [] } : r),
      ),
    } as ReportContent);
    void applyNow(false, "已還原此列");
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
    void applyNow(false, "已加回項目");
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

  // e.g. "週三 → 下週二 · 共 5 個工作日", derived from the report's own range.
  let rangeLabel = "";
  if (content) {
    const s = parseIsoDate(content.weekStart.replaceAll("/", "-"));
    const e = parseIsoDate(content.weekEnd.replaceAll("/", "-"));
    const spanDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const workdays = Array.from({ length: spanDays }, (_, i) =>
      addDays(s, i),
    ).filter((d) => !isWeekend(d)).length;
    const crossesWeek = e.getDay() < s.getDay();
    rangeLabel = `${WEEKDAYS[s.getDay()]} → ${crossesWeek ? "下" : ""}${WEEKDAYS[e.getDay()]} · 共 ${workdays} 個工作日`;
  }

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
          <div className="card">
            <div className="flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  工作區間
                  {isThisWeek && (
                    <InfoTip label="週報如何更新">
                      內容會依最新的記事自動更新；你在這裡修改的內容只留在週報，不會改到記事，也不會被自動更新覆蓋。
                    </InfoTip>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <output className="text-xs text-muted">
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
                </div>
              </div>
              <p
                className={`flex w-fit flex-wrap items-center gap-x-2 rounded-lg px-3 py-1.5 text-2xl font-semibold tabular-nums ${isThisWeek ? "bg-brand-soft text-brand" : "bg-slate-100 text-muted"}`}
              >
                <span>{content.weekStart}</span>
                <span
                  aria-hidden="true"
                  className={isThisWeek ? "text-brand/40" : "text-muted/40"}
                >
                  –
                </span>
                <span>{content.weekEnd}</span>
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>{rangeLabel}</span>
                <span
                  className={`badge ${isThisWeek ? "bg-brand-soft text-brand" : "bg-slate-100 text-muted"}`}
                >
                  {isThisWeek ? "本週" : "過去週次"}
                </span>
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-line bg-slate-50 px-5 py-3">
              <TaskMenu
                items={[
                  {
                    label: "從頭重新產生",
                    danger: true,
                    onSelect: () => setConfirmingReset(true),
                  },
                ]}
              />
              <button
                type="button"
                onClick={exportDocx}
                disabled={exporting}
                className="btn btn-primary btn-lg max-sm:flex-1"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" />
                </svg>
                {exporting
                  ? "匯出中…"
                  : report.status === "exported"
                    ? "重新匯出 Word"
                    : "匯出 Word"}
              </button>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                一、本週工作項目
                {/* Phones have no table header; md+ shows this in the table. */}
                <span className="inline-flex md:hidden">
                  <InfoTip label="如何加入下週工作項目">
                    按每列的「→
                    加入下週」，會把名稱和預計完成日帶到下週表；預計達成進度和備註請到下週表填寫。
                  </InfoTip>
                </span>
              </h2>
              <button
                type="button"
                className={SORT_BTN}
                onClick={() => sortTable("thisWeek")}
              >
                <span aria-hidden="true">↕</span>
                依預計完成日排序
              </button>
            </div>
            <ReportTable<ThisWeekRow>
              rows={content.thisWeek}
              progressKey="progress"
              progressLabel="目前進度"
              emptyText="沒有項目。有新的記事時會自動帶入，也可以按下方「新增一列」。"
              addToNext={{ isAdded: isInNext, onAdd: addToNext }}
              actionsHelp={
                <InfoTip label="如何加入下週工作項目" align="right">
                  按每列右側的 →
                  圖示，會把名稱和預計完成日帶到下週表；預計達成進度和備註請到下週表填寫。
                </InfoTip>
              }
              dismissed={content.dismissed?.thisWeek ?? []}
              onEdit={(id, patch) => editRow("thisWeek", id, patch)}
              onRemove={(id) => removeRow("thisWeek", id)}
              onReset={(id) => resetRow("thisWeek", id)}
              onRestore={(groupKey) => restoreRow("thisWeek", groupKey)}
              onAdd={() => {
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
                );
                toast.success("已新增一列");
              }}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">二、下週預計工作項目</h2>
              <button
                type="button"
                className={SORT_BTN}
                onClick={() => sortTable("nextWeek")}
              >
                <span aria-hidden="true">↕</span>
                依預計完成日排序
              </button>
            </div>
            <ReportTable<NextWeekRow>
              rows={content.nextWeek}
              progressKey="targetProgress"
              progressLabel="預計達成進度"
              emptyText="沒有項目。在本週工作項目按「→ 加入下週」加入，也可以按下方「新增一列」。"
              onEdit={(id, patch) => editRow("nextWeek", id, patch)}
              onRemove={(id) => removeRow("nextWeek", id)}
              onAdd={() => {
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
                );
                toast.success("已新增一列");
              }}
            />
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmingReset}
        title="從頭重新產生這份週報？"
        message="會清除你在這份週報的所有修改（包含下週表），改成依最新記事重新帶入。此操作無法復原。"
        confirmLabel="重新產生"
        danger
        busy={resetting}
        onConfirm={startOver}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}
