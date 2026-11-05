"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/db/schema";
import type { ProjectInfo } from "@/lib/entries";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { useToast } from "./Toast";

type Mode = { kind: "create"; date: string } | { kind: "edit"; entry: Entry };

type Props = {
  mode: Mode;
  projects: ProjectInfo[];
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
  onDone,
  onCancel,
  onDirtyChange,
  autoFocus,
}: Props) {
  const { show } = useToast();
  const editing = mode.kind === "edit" ? mode.entry : null;

  const [content, setContent] = useState(editing?.content ?? "");
  const [project, setProject] = useState(editing?.project ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Suggestions of work items used before (shown while the field has focus).
  const [projectFocused, setProjectFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
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

  const typed = project.trim().toLowerCase();
  const suggestions = projectFocused
    ? projects
        .filter(
          (p) =>
            p.project !== project.trim() &&
            (typed === "" || p.project.toLowerCase().includes(typed)),
        )
        .slice(0, 6)
    : [];

  function choose(name: string) {
    setProject(name);
    setActiveIdx(-1);
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
          setError((await res.json().catch(() => null))?.error ?? "儲存失敗");
          return;
        }
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
        setError((await res.json().catch(() => null))?.error ?? "儲存失敗");
        return;
      }
      setContent("");
      setProject("");
      projectRef.current?.focus();
      show({ message: "已記錄", duration: 2000 });
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  // Both fields behave the same: Enter saves, Shift+Enter adds a line,
  // Esc cancels. (Enter that confirms IME input is ignored.)
  function keyHandler(isProject: boolean) {
    return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (isProject && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % suggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          return;
        }
        if (e.key === "Enter" && activeIdx >= 0 && !e.shiftKey) {
          e.preventDefault();
          choose(suggestions[activeIdx].project);
          return;
        }
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
            setActiveIdx(-1);
            if (error) setError(null);
          }}
          onFocus={() => setProjectFocused(true)}
          onBlur={() => setProjectFocused(false)}
          onKeyDown={keyHandler(true)}
          placeholder="例如：專案A"
          required
          aria-required="true"
          className="field min-h-10 font-normal"
        />
      </label>
      {suggestions.length > 0 && (
        <ul
          aria-label="用過的工作項目"
          className="-mt-1 flex max-h-40 flex-col overflow-auto rounded-lg border border-line bg-surface p-1 shadow-sm"
        >
          {suggestions.map((p, i) => (
            <li key={p.project}>
              <button
                type="button"
                // Keep focus in the field so choosing does not blur it first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p.project)}
                className={`w-full whitespace-pre-wrap break-words rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-brand-soft ${
                  i === activeIdx ? "bg-brand-soft text-brand" : ""
                }`}
              >
                {p.project}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          備註：
          <span className="ml-1 text-xs font-normal text-muted">選填</span>
        </span>
        <AutoGrowTextarea
          textareaRef={textRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={keyHandler(false)}
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
