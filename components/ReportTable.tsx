"use client";

import { useEffect, useRef, useState } from "react";
import type { DismissedItem } from "@/lib/report";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { InfoTip } from "./InfoTip";

type Row = {
  id: string;
  no: number;
  title: string;
  dueDate: string;
  note: string;
  groupKey?: string;
  touched?: string[];
};

type Props<T extends Row> = {
  rows: T[];
  progressKey: keyof T & string;
  progressLabel: string;
  /** Rows the user deleted from the generated list (this-week table only). */
  dismissed?: DismissedItem[];
  /** Text shown when the table has no rows. */
  emptyText: string;
  /** This-week table: per-row button that copies the row into next week. */
  addToNext?: {
    isAdded: (row: T) => boolean;
    onAdd: (row: T) => void;
  };
  onEdit: (id: string, patch: Partial<T>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  /** Drop manual edits on a row so it follows the latest data again. */
  onReset?: (id: string) => void;
  onRestore?: (groupKey: string) => void;
  /** Help shown in the (otherwise empty) actions column header; md+ only. */
  actionsHelp?: React.ReactNode;
};

// Phones: each row is a stacked block. md+: a document-style grid with
// vertical rules, matching the columns of the Word template.
const GRID =
  "md:grid md:grid-cols-[3rem_minmax(0,1.6fr)_7rem_9.5rem_minmax(0,1.4fr)_4.5rem] md:divide-x md:divide-line";

const cell = "flex flex-col gap-1 md:block md:p-1";
const mobileLabel = "px-2 text-xs font-medium text-muted md:hidden";
const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-md transition-colors";

const pad2 = (n: string) => n.padStart(2, "0");

/** Stored "2026/11/5" -> date input value "2026-11-05" (anything else -> ""). */
function toInputDate(s: string): string {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s.trim());
  return m ? `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` : "";
}

/**
 * By default a date field only opens its calendar from the small icon.
 * Open it when the field itself is clicked. (Typing still works: the picker
 * simply closes. Some browsers refuse showPicker(); then the icon still works.)
 */
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // ignore: the native behavior stays available
  }
}

// "60%" <-> "60"; storage keeps the display string used by the Word template.
const stripPercent = (s: string) => s.replace(/%$/, "");
const withPercent = (s: string) => (s.trim() === "" ? "" : `${s.trim()}%`);

export function ReportTable<T extends Row>({
  rows,
  progressKey,
  progressLabel,
  dismissed = [],
  emptyText,
  addToNext,
  onEdit,
  onRemove,
  onAdd,
  onReset,
  onRestore,
  actionsHelp,
}: Props<T>) {
  // Deleting is a two-step action: first click asks, second click deletes.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Land on the safe choice so a stray Enter cannot delete.
  useEffect(() => {
    if (confirmingId) cancelRef.current?.focus();
  }, [confirmingId]);

  /** "Add to next week" control; text button on phones, icon on desktop. */
  function nextWeekControl(r: T, mobile: boolean) {
    if (!addToNext) return null;
    if (addToNext.isAdded(r)) {
      return mobile ? (
        <span className="inline-flex min-h-8 items-center px-2 text-xs text-ok">
          ✓ 已在下週
        </span>
      ) : (
        <span title="已在下週工作項目" className={`${iconBtn} text-ok`}>
          <span aria-hidden="true">✓</span>
          <span className="sr-only">已在下週工作項目</span>
        </span>
      );
    }
    const hasTitle = !!r.title.trim();
    const hint = hasTitle
      ? "新增至下週工作項目（帶入名稱與預計完成日）"
      : "請先填寫工作項目名稱";
    return (
      <button
        type="button"
        disabled={!hasTitle}
        onClick={() => addToNext.onAdd(r)}
        title={hint}
        aria-label={hint}
        className={
          mobile
            ? "btn btn-ghost min-h-8 px-2 py-1 text-xs text-brand hover:bg-brand-soft hover:text-brand"
            : `${iconBtn} text-muted hover:bg-brand-soft hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted`
        }
      >
        {mobile ? (
          "→ 加入下週"
        ) : (
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
            <path d="M4 10h11m0 0-4-4m4 4-4 4" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card">
        <div
          className={`hidden rounded-t-xl border-b border-line bg-slate-50 text-xs font-semibold text-ink ${GRID}`}
        >
          <span className="px-2 py-2 text-center">序號</span>
          <span className="px-3 py-2">工作項目描述</span>
          <span className="px-3 py-2">{progressLabel}</span>
          <span className="px-3 py-2">預計完成日</span>
          <span className="px-3 py-2">備註</span>
          <span className="flex items-center justify-center px-2 py-1.5">
            {actionsHelp}
          </span>
        </div>

        {rows.length === 0 && (
          <p className="border-b border-line px-4 py-8 text-center text-sm text-muted">
            {emptyText}
          </p>
        )}

        <ul className="divide-y divide-line">
          {rows.map((r, i) => {
            const edited =
              !!onReset && r.groupKey != null && (r.touched?.length ?? 0) > 0;
            const progress = stripPercent(String(r[progressKey] ?? ""));
            const dateValue = toInputDate(r.dueDate);
            return (
              <li key={r.id} className="group">
                <div
                  className={`flex flex-col gap-2 px-2 py-3 md:gap-0 md:px-0 md:py-0 ${GRID}`}
                >
                  {/* Phones: "第 N 項" bar with the row actions. md+: the number. */}
                  <div className="flex items-center justify-between px-2 md:block md:py-2.5 md:text-center">
                    <span className="text-sm font-semibold text-muted tabular-nums">
                      <span className="md:hidden">第 </span>
                      {i + 1}
                      <span className="md:hidden"> 項</span>
                    </span>
                    <span className="flex items-center gap-1 md:hidden">
                      {nextWeekControl(r, true)}
                      <button
                        type="button"
                        aria-label={`刪除第 ${i + 1} 列`}
                        onClick={() => setConfirmingId(r.id)}
                        className="btn btn-ghost min-h-8 px-2 py-1 text-xs text-danger hover:bg-danger-soft hover:text-danger"
                      >
                        刪除
                      </button>
                    </span>
                  </div>

                  <div className={cell}>
                    <span className={mobileLabel}>工作項目描述</span>
                    <span className="flex items-start gap-1">
                      <AutoGrowTextarea
                        aria-label={`第 ${i + 1} 列工作項目描述`}
                        className="cell-input font-medium"
                        placeholder="—"
                        value={r.title}
                        onChange={(e) =>
                          onEdit(r.id, { title: e.target.value } as Partial<T>)
                        }
                      />
                      {edited && (
                        <InfoTip
                          label="已手動修改，可還原為系統帶入"
                          triggerClassName="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-brand-soft"
                          trigger={
                            <span className="size-2 rounded-full bg-brand" />
                          }
                          align="right"
                        >
                          <span className="block text-muted">
                            這一列已手動修改，之後的記事更新不會覆蓋你改過的欄位。
                          </span>
                          <button
                            type="button"
                            onClick={() => onReset?.(r.id)}
                            className="mt-2 font-medium text-brand hover:underline"
                          >
                            還原為系統帶入
                          </button>
                        </InfoTip>
                      )}
                    </span>
                  </div>

                  <label className={cell}>
                    <span className={mobileLabel}>{progressLabel}</span>
                    <span className="relative block">
                      <input
                        className="cell-input pr-6 tabular-nums"
                        inputMode="numeric"
                        placeholder="—"
                        value={progress}
                        onChange={(e) =>
                          onEdit(r.id, {
                            [progressKey]: withPercent(
                              e.target.value.replace(/[^\d]/g, ""),
                            ),
                          } as Partial<T>)
                        }
                      />
                      {progress && (
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                          %
                        </span>
                      )}
                    </span>
                  </label>

                  <label className={cell}>
                    <span className={mobileLabel}>預計完成日</span>
                    <input
                      type="date"
                      className={`cell-input tabular-nums ${dateValue ? "" : "text-muted/50 focus:text-ink"}`}
                      value={dateValue}
                      onClick={openPicker}
                      onChange={(e) => {
                        // Stored as YYYY/MM/DD; the picker works in YYYY-MM-DD.
                        onEdit(r.id, {
                          dueDate: e.target.value.replaceAll("-", "/"),
                        } as Partial<T>);
                      }}
                    />
                  </label>

                  <label className={cell}>
                    <span className={mobileLabel}>備註</span>
                    <AutoGrowTextarea
                      className="cell-input"
                      placeholder="—"
                      value={r.note}
                      onChange={(e) =>
                        onEdit(r.id, { note: e.target.value } as Partial<T>)
                      }
                    />
                  </label>

                  <div className="hidden items-start justify-center gap-0.5 p-1 md:flex">
                    {nextWeekControl(r, false)}
                    <button
                      type="button"
                      aria-label={`刪除第 ${i + 1} 列`}
                      title="刪除這一列"
                      onClick={() => setConfirmingId(r.id)}
                      className={`${iconBtn} text-muted/40 hover:bg-danger-soft hover:text-danger focus-visible:text-danger group-hover:text-muted`}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {confirmingId === r.id && (
                  <div
                    role="alert"
                    className="mx-2 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger-soft px-3 py-2 md:my-2"
                  >
                    <span className="text-sm font-medium text-danger">
                      確定刪除第 {i + 1} 列？
                    </span>
                    <span className="flex gap-2">
                      <button
                        ref={cancelRef}
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        onKeyDown={(e) =>
                          e.key === "Escape" && setConfirmingId(null)
                        }
                        className="btn min-h-8 px-3 py-1 text-sm"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onRemove(r.id);
                          setConfirmingId(null);
                        }}
                        className="btn min-h-8 border-danger bg-danger px-3 py-1 text-sm text-white hover:bg-red-800"
                      >
                        刪除
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onAdd}
          className={`flex w-full items-center gap-1 rounded-b-xl px-4 py-2.5 text-sm text-muted transition-colors hover:bg-slate-50 hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${rows.length > 0 ? "border-t border-line" : ""}`}
        >
          ＋ 新增一列
        </button>
      </div>

      {onRestore && dismissed.length > 0 && (
        <section
          aria-label="已移除的項目"
          className="flex gap-3 rounded-xl border border-dashed border-warn/40 bg-warn-soft/60 px-4 py-3"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="mt-0.5 size-4 shrink-0 text-warn"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h14M8 6V4h4v2m-6 0 1 10h6l1-10" />
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm text-ink">
              <span className="font-semibold">
                已從週報移除 {dismissed.length} 項
              </span>
              <span className="text-muted">（記事沒有被刪除，可以加回）</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {dismissed.map((d) => {
                const name = d.title || "未命名";
                return (
                  <button
                    key={d.groupKey}
                    type="button"
                    onClick={() => onRestore(d.groupKey)}
                    title={`加回「${name}」`}
                    className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-lg border border-brand/30 bg-surface px-3 py-1.5 text-sm font-medium text-brand shadow-sm transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span aria-hidden="true">＋</span>
                    <span className="shrink-0">加回</span>
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
