"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Entry } from "@/db/schema";
import { WEEK_CONFIG } from "@/lib/config";
import { todayString } from "@/lib/date";
import type { ProjectInfo } from "@/lib/entries";
import { addDays, getWeekRange, parseIsoDate, toIsoDate } from "@/lib/week";
import { DayColumn } from "./DayColumn";
import { useToast } from "./Toast";

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export function WeekBoard({ date }: { date: string | null }) {
  const { show } = useToast();
  // Today is read on the client only (avoids prerendering a changing value).
  const [today, setToday] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToday(todayString()), []);

  const base = date ?? today;
  const weekStart = useMemo(
    () => (base ? getWeekRange(parseIsoDate(base)).start : null),
    [base],
  );
  const startIso = weekStart ? toIsoDate(weekStart) : null;

  const load = useCallback(async () => {
    if (!startIso) return;
    const [e, p] = await Promise.all([
      fetch(`/api/entries?date=${startIso}`, { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    if (!e.ok) {
      setError("載入失敗，請重新整理頁面");
      return;
    }
    setError(null);
    setEntries((await e.json()).entries);
    if (p.ok) setProjects(await p.json());
  }, [startIso]);

  useEffect(() => {
    setEntries(null);
    load();
  }, [load]);

  // The confirmation step is in EntryItem; by now the note is really deleted.
  async function remove(entry: Entry) {
    const res = await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
    if (res.ok) {
      show({ message: "已刪除記事", duration: 2500 });
      load();
    } else {
      show({ message: "刪除失敗，請再試一次", duration: 4000 });
    }
  }

  if (!weekStart || !startIso) return <p className="text-muted">載入中…</p>;

  const span = WEEK_CONFIG.endDay - WEEK_CONFIG.startDay + 1;
  const days = Array.from({ length: span }, (_, i) => addDays(weekStart, i));
  const weekendEntries = (entries ?? []).filter((e) => {
    const d = parseIsoDate(e.date).getDay();
    return d < WEEK_CONFIG.startDay || d > WEEK_CONFIG.endDay;
  });

  const prev = toIsoDate(addDays(weekStart, -7));
  const next = toIsoDate(addDays(weekStart, 7));
  const thisWeek = today
    ? toIsoDate(getWeekRange(parseIsoDate(today)).start) === startIso
    : false;
  const navLink =
    "rounded-md px-3 py-1 text-muted transition-colors hover:bg-slate-100 hover:text-ink";
  const range = `${startIso.slice(5).replace("-", "/")} – ${toIsoDate(
    days[days.length - 1],
  )
    .slice(5)
    .replace("-", "/")}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">本週記事</h1>
          <p className="text-sm tabular-nums text-muted">
            {startIso.slice(0, 4)} 年 {range}
          </p>
        </div>
        <nav
          aria-label="切換週次"
          className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm"
        >
          <Link href={`/?date=${prev}`} className={navLink}>
            ← 上一週
          </Link>
          <Link
            href="/"
            className={`${navLink} ${thisWeek ? "bg-brand-soft text-brand" : ""}`}
          >
            本週
          </Link>
          <Link href={`/?date=${next}`} className={navLink}>
            下一週 →
          </Link>
        </nav>
      </div>

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {entries === null && !error && <p className="text-muted">載入中…</p>}

      {entries && (
        <>
          <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-5">
            {days.map((d) => {
              const iso = toIsoDate(d);
              return (
                <DayColumn
                  key={iso}
                  date={iso}
                  weekday={WEEKDAYS[d.getDay()]}
                  isToday={iso === today}
                  entries={entries.filter((e) => e.date === iso)}
                  projects={projects}
                  onChanged={load}
                  onDelete={remove}
                />
              );
            })}
          </div>
          {weekendEntries.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              {[...new Set(weekendEntries.map((e) => e.date))].map((iso) => (
                <DayColumn
                  key={iso}
                  date={iso}
                  weekday={WEEKDAYS[parseIsoDate(iso).getDay()]}
                  isToday={iso === today}
                  entries={weekendEntries.filter((e) => e.date === iso)}
                  projects={projects}
                  readOnly
                  onChanged={load}
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
