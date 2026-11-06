"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Entry, FavoriteProject } from "@/db/schema";
import type { ProjectInfo } from "@/lib/entries";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { useToast } from "./Toast";

/** "動作失敗：原因" from the API error body (falls back to the action only). */
async function failure(res: Response, action: string) {
  const reason = (await res.json().catch(() => null))?.error;
  return reason ? `${action}：${reason}` : action;
}

type Mode = { kind: "create"; date: string } | { kind: "edit"; entry: Entry };

type Props = {
  mode: Mode;
  projects: ProjectInfo[];
  favorites: FavoriteProject[];
  /** Called after a save so the board can reload. */
  onDone: () => void;
  onCancel?: () => void;
  /** Reports whether the user has typed something not saved yet. */
  onDirtyChange?: (dirty: boolean) => void;
  autoFocus?: boolean;
};

export function EntryComposer({
  mode,
  projects,
  favorites,
  onDone,
  onCancel,
  onDirtyChange,
  autoFocus,
}: Props) {
  const toast = useToast();
  const editing = mode.kind === "edit" ? mode.entry : null;

  const [content, setContent] = useState(editing?.content ?? "");
  const [project, setProject] = useState(editing?.project ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pickers (recent / favorites) open only from their buttons, one at a time.
  const [pickerOpen, setPickerOpen] = useState<"recent" | "favorites" | null>(
    null,
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) projectRef.current?.focus();
  }, [autoFocus]);

  // Tell the parent when there is unsaved input, so it will not collapse this
  // form (and lose the text) when the user clicks somewhere else.
  const dirty =
    content !== (editing?.content ?? "") ||
    project !== (editing?.project ?? "");
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  // Close the picker when clicking elsewhere.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  // Recent: the 6 latest work items that are not already favorites.
  const favoriteNames = new Set(favorites.map((f) => f.name));
  const recent = projects
    .filter((p) => !favoriteNames.has(p.project))
    .slice(0, 6);

  function choose(name: string) {
    setProject(name);
    setPickerOpen(null);
    if (error) setError(null);
    textRef.current?.focus();
  }

  async function submit() {
    if (submitting) return;
    const name = project.trim();
    if (!name) {
      setError("請先填寫工作項目");
      projectRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/entries/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            project: name,
          }),
        });
        if (!res.ok) {
          toast.error(await failure(res, "更新記事失敗"));
          return;
        }
        toast.success("已更新記事");
        onDone();
        return;
      }

      if (mode.kind !== "create") return;
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: mode.date,
          content,
          project: name,
        }),
      });
      if (!res.ok) {
        toast.error(await failure(res, "新增記事失敗"));
        return;
      }
      setContent("");
      setProject("");
      projectRef.current?.focus();
      toast.success("已新增記事");
      onDone();
    } catch {
      toast.error(`${editing ? "更新" : "新增"}記事失敗，請檢查網路後再試一次`);
    } finally {
      setSubmitting(false);
    }
  }

  // Both fields behave the same: Enter saves, Shift+Enter adds a line,
  // Esc cancels. (Enter that confirms IME input is ignored.)
  function keyHandler() {
    return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Escape" && pickerOpen) {
        setPickerOpen(null);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape") onCancel?.();
    };
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span>
            工作項目：<span className="text-danger">*</span>
            <span className="ml-1 text-xs font-normal text-muted">必填</span>
          </span>
          <AutoGrowTextarea
            textareaRef={projectRef}
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={keyHandler()}
            placeholder="例如：專案A"
            required
            aria-required="true"
            className="field min-h-10 font-normal"
          />
        </label>
        <div ref={pickerRef} className="relative mt-1 flex flex-wrap gap-1">
          {recent.length > 0 && (
            <PickerButton
              label="最近使用"
              open={pickerOpen === "recent"}
              onClick={() =>
                setPickerOpen((o) => (o === "recent" ? null : "recent"))
              }
            />
          )}
          <PickerButton
            label="常用項目"
            open={pickerOpen === "favorites"}
            onClick={() =>
              setPickerOpen((o) => (o === "favorites" ? null : "favorites"))
            }
          />
          {pickerOpen && (
            <ul
              aria-label={
                pickerOpen === "recent" ? "最近使用的工作項目" : "常用項目"
              }
              className="absolute inset-x-0 top-full z-10 mt-1 flex max-h-40 flex-col overflow-auto rounded-lg border border-line bg-surface p-1 shadow-md"
            >
              {(pickerOpen === "recent"
                ? recent.map((p) => p.project)
                : favorites.map((f) => f.name)
              ).map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => choose(name)}
                    className="w-full whitespace-pre-wrap break-words rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-brand-soft"
                  >
                    {name}
                  </button>
                </li>
              ))}
              {pickerOpen === "favorites" && (
                <li
                  className={
                    favorites.length > 0 ? "mt-1 border-t border-line pt-1" : ""
                  }
                >
                  {favorites.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted">尚無常用項目</p>
                  )}
                  <Link
                    href="/favorites"
                    className="block rounded-md px-2 py-1 text-xs text-brand hover:bg-brand-soft"
                  >
                    管理常用項目
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          備註：
          <span className="ml-1 text-xs font-normal text-muted">選填</span>
        </span>
        <AutoGrowTextarea
          textareaRef={textRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={keyHandler()}
          placeholder="做了什麼？"
          className="field min-h-10 font-normal"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn">
              取消
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !project.trim()}
            className="btn btn-primary"
          >
            {editing ? "儲存" : "記錄"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickerButton({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="listbox"
      className="rounded-md px-1.5 py-0.5 text-xs font-normal text-brand hover:bg-brand-soft"
    >
      {label} ▾
    </button>
  );
}
