"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, FavoriteProject } from "@/db/schema";
import type { ProjectInfo } from "@/lib/entries";
import { EntryComposer } from "./EntryComposer";
import { EntryItem } from "./EntryItem";

type Props = {
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  isToday: boolean;
  entries: Entry[];
  projects: ProjectInfo[];
  favorites: FavoriteProject[];
  /** Weekend column has no composer. */
  readOnly?: boolean;
  onChanged: () => void;
  onDelete: (entry: Entry) => void;
};

export function DayColumn({
  date,
  weekday,
  isToday,
  entries,
  projects,
  favorites,
  readOnly,
  onChanged,
  onDelete,
}: Props) {
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Clicking elsewhere closes an open form, unless the user already typed
  // something (that text would be lost).
  const createWrapRef = useRef<HTMLDivElement>(null);
  const editWrapRef = useRef<HTMLLIElement>(null);
  const createDirty = useRef(false);
  const editDirty = useRef(false);
  const setCreateDirty = useCallback((d: boolean) => {
    createDirty.current = d;
  }, []);
  const setEditDirty = useCallback((d: boolean) => {
    editDirty.current = d;
  }, []);

  // Every day's form collapses on outside click (unless dirty).
  const collapsible = composing && !readOnly;
  useEffect(() => {
    if (!collapsible && editingId === null) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        collapsible &&
        !createDirty.current &&
        !createWrapRef.current?.contains(target)
      ) {
        setComposing(false);
      }
      if (
        editingId !== null &&
        !editDirty.current &&
        !editWrapRef.current?.contains(target)
      ) {
        setEditingId(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [collapsible, editingId]);

  const hasEntries = entries.length > 0;
  const composerOpen = !readOnly && composing;
  // Days with notes: solid white card with a darker border.
  // Empty days: dashed, low-contrast outline. Today: strong blue frame with a
  // glow ring and a full-width "today" band across the top.
  const frame = isToday
    ? "border-brand bg-surface shadow-md ring-2 ring-brand/30"
    : hasEntries
      ? "border-slate-300 bg-surface shadow-sm"
      : "border-dashed border-slate-300 bg-transparent";

  return (
    <section
      aria-label={`${weekday} ${date}`}
      className={`flex flex-col gap-2 rounded-xl border p-3 ${frame}`}
    >
      {isToday && (
        <div className="-mx-3 -mt-3 mb-1 rounded-t-[11px] bg-brand px-3 py-1 text-center text-xs font-semibold tracking-wide text-white">
          今天
        </div>
      )}
      <header className="flex items-baseline justify-between">
        <h2
          className={`flex items-center font-semibold ${
            hasEntries || isToday ? "" : "text-muted"
          }`}
        >
          {weekday}
          {hasEntries && (
            <span className="badge ml-2 bg-slate-100 text-ink">
              {entries.length} 筆
            </span>
          )}
        </h2>
        <time dateTime={date} className="text-xs tabular-nums text-muted">
          {date.slice(5).replace("-", "/")}
        </time>
      </header>

      <ul className="flex flex-col gap-2">
        {entries.map((e) =>
          editingId === e.id ? (
            <li
              key={e.id}
              ref={editWrapRef}
              className="rounded-lg border border-dashed border-brand/50 bg-brand-soft/60 p-2.5"
            >
              <EntryComposer
                mode={{ kind: "edit", entry: e }}
                projects={projects}
                favorites={favorites}
                autoFocus
                onDirtyChange={setEditDirty}
                onCancel={() => setEditingId(null)}
                onDone={() => {
                  setEditingId(null);
                  onChanged();
                }}
              />
            </li>
          ) : (
            <EntryItem
              key={e.id}
              entry={e}
              onEdit={() => setEditingId(e.id)}
              onDelete={() => onDelete(e)}
            />
          ),
        )}
      </ul>

      {!hasEntries && !composerOpen && (
        <p className="py-1 text-center text-xs text-muted">還沒有記事</p>
      )}

      {!readOnly &&
        (composing ? (
          <div
            ref={createWrapRef}
            className="rounded-lg border border-dashed border-brand/50 bg-brand-soft/60 p-2.5"
          >
            <EntryComposer
              mode={{ kind: "create", date }}
              projects={projects}
              favorites={favorites}
              onDirtyChange={setCreateDirty}
              autoFocus
              onCancel={() => setComposing(false)}
              onDone={() => {
                setComposing(false);
                onChanged();
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="btn btn-ghost justify-start border-dashed border-line text-muted"
          >
            ＋ 新增記事
          </button>
        ))}
    </section>
  );
}
