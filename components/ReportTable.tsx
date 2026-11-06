"use client";

import { useEffect, useRef, useState } from "react";
import type { DismissedItem } from "@/lib/report";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

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
};

// Phones: each row is a stacked card. md+: a table-like grid.
const GRID =
  "md:grid md:grid-cols-[2.5rem_minmax(0,1.6fr)_6rem_10.5rem_minmax(0,1.4fr)_2.5rem] md:items-start md:gap-2";

const cell = "flex flex-col gap-1 md:block";
const mobileLabel = "text-xs font-medium text-muted md:hidden";

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
}: Props<T>) {
  // Deleting is a two-step action: first click asks, second click deletes.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Land on the safe choice so a stray Enter cannot delete.
  useEffect(() => {
    if (confirmingId) cancelRef.current?.focus();
  }, [confirmingId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="card overflow-hidden">
        <div
          className={`hidden rounded-t-xl bg-brand-soft px-3 py-2 text-xs font-semibold text-brand ${GRID}`}
        >
          <span>序號</span>
          <span>工作項目描述</span>
          <span>{progressLabel}</span>
          <span>預計完成日</span>
          <span>備註</span>
          <span />
        </div>

        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {emptyText}
          </p>
        )}

        <ul className="divide-y divide-line">
          {rows.map((r, i) => {
            const edited =
              !!onReset && r.groupKey != null && (r.touched?.length ?? 0) > 0;
            return (
              <li
                key={r.id}
                className={`flex flex-col gap-3 px-3 py-3 ${GRID}`}
              >
                <div className="flex items-center justify-between md:block md:pt-2">
                  <span className="text-sm font-semibold text-muted">
                    <span className="md:hidden">第 </span>
                    {i + 1}
                    <span className="md:hidden"> 項</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`刪除第 ${i + 1} 列`}
                    onClick={() => setConfirmingId(r.id)}
                    className="btn btn-ghost min-h-8 px-2 text-danger hover:bg-danger-soft hover:text-danger md:hidden"
                  >
                    刪除
                  </button>
                </div>

                <label className={cell}>
                  <span className={mobileLabel}>工作項目描述</span>
                  <AutoGrowTextarea
                    className="field min-h-10"
                    value={r.title}
                    onChange={(e) =>
                      onEdit(r.id, { title: e.target.value } as Partial<T>)
                    }
                  />
                  {edited && (
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                      已手動修改
                      <button
                        type="button"
                        onClick={() => onReset?.(r.id)}
                        className="text-brand hover:underline"
                      >
                        還原為系統帶入
                      </button>
                    </span>
                  )}
                </label>

                <label className={cell}>
                  <span className={mobileLabel}>{progressLabel}</span>
                  <span className="relative block">
                    <input
                      className="field pr-7 tabular-nums"
                      inputMode="numeric"
                      placeholder="填寫"
                      value={stripPercent(String(r[progressKey] ?? ""))}
                      onChange={(e) =>
                        onEdit(r.id, {
                          [progressKey]: withPercent(
                            e.target.value.replace(/[^\d]/g, ""),
                          ),
                        } as Partial<T>)
                      }
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                      %
                    </span>
                  </span>
                </label>

                <label className={cell}>
                  <span className={mobileLabel}>預計完成日</span>
                  <input
                    type="date"
                    className="field"
                    value={toInputDate(r.dueDate)}
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
                    className="field min-h-10"
                    value={r.note}
                    onChange={(e) =>
                      onEdit(r.id, { note: e.target.value } as Partial<T>)
                    }
                  />
                </label>

                <button
                  type="button"
                  aria-label={`刪除第 ${i + 1} 列`}
                  onClick={() => setConfirmingId(r.id)}
                  className="btn btn-ghost hidden size-9 min-h-0 p-0 text-muted hover:bg-danger-soft hover:text-danger md:inline-flex"
                >
                  ✕
                </button>
                {addToNext && (
                  <div className="flex justify-end md:col-span-full">
                    {addToNext.isAdded(r) ? (
                      <span className="inline-flex min-h-8 items-center px-2 text-xs text-muted">
                        ✓ 已在下週工作項目
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!r.title.trim()}
                        onClick={() => addToNext.onAdd(r)}
                        title={
                          r.title.trim()
                            ? "會帶入工作項目名稱與預計完成日；預計達成進度和備註請到下週工作項目填寫"
                            : "請先填寫工作項目名稱"
                        }
                        className="btn btn-ghost min-h-8 px-2 py-1 text-xs text-brand hover:bg-brand-soft hover:text-brand"
                      >
                        ＋ 新增至下週工作項目
                      </button>
                    )}
                  </div>
                )}
                {confirmingId === r.id && (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger-soft px-3 py-2 md:col-span-full"
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
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onAdd} className="btn w-full sm:w-fit">
          + 新增一列
        </button>
        {onRestore && dismissed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            已移除 {dismissed.length} 項：
            {dismissed.map((d) => (
              <button
                key={d.groupKey}
                type="button"
                onClick={() => onRestore(d.groupKey)}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs text-ink transition-colors hover:bg-brand-soft hover:text-brand"
                title="加回這一列"
              >
                ＋ {d.title || "未命名"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
