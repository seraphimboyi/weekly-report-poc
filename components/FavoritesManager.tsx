"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteProject } from "@/db/schema";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { useToast } from "./Toast";

async function errorOf(res: Response, fallback: string) {
  return (await res.json().catch(() => null))?.error ?? fallback;
}

// Bad input (empty, too long, duplicate) is fixed in place, so it stays next
// to the field; anything else is a toast.
const isFieldError = (res: Response) =>
  res.status === 400 || res.status === 409;

type RenameResult = { ok: true } | { ok: false; inline?: string };

export function FavoritesManager() {
  const toast = useToast();
  const [items, setItems] = useState<FavoriteProject[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/favorites", { cache: "no-store" });
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setItems(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const value = name.trim();
    if (!value || adding) return;
    setAdding(true);
    setAddError(null);
    // Clear right away so text typed while saving is not wiped afterwards.
    setName("");
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      if (!res.ok) {
        if (isFieldError(res)) setAddError(await errorOf(res, "新增失敗"));
        else toast.error("新增常用項目失敗，請再試一次");
        setName((cur) => (cur === "" ? value : cur));
        return;
      }
      toast.success("已新增常用項目");
      await load();
    } catch {
      toast.error("新增常用項目失敗，請檢查網路後再試一次");
      setName((cur) => (cur === "" ? value : cur));
    } finally {
      setAdding(false);
    }
  }

  async function move(id: number, direction: "up" | "down") {
    const res = await fetch(`/api/favorites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: direction }),
    });
    if (res.ok) setItems(await res.json());
    else toast.error("調整順序失敗，請再試一次");
  }

  async function rename(id: number, value: string): Promise<RenameResult> {
    const res = await fetch(`/api/favorites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    if (!res.ok) {
      if (isFieldError(res)) {
        return { ok: false, inline: await errorOf(res, "改名失敗") };
      }
      toast.error("更新常用項目失敗，請再試一次");
      return { ok: false };
    }
    toast.success("已更新常用項目");
    await load();
    return { ok: true };
  }

  async function remove(id: number) {
    const res = await fetch(`/api/favorites/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("已刪除常用項目");
      await load();
    } else {
      toast.error("刪除常用項目失敗，請再試一次");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">常用項目</h1>
        <p className="mt-1 text-sm text-muted">
          放每週都會用到的工作項目（例如會議、出差）。新增記事時可從「常用項目」一鍵填入；改名或刪除不會影響已寫的記事。
        </p>
      </div>

      <div className="card flex flex-col gap-2 p-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span>
            新增常用項目：
            <span className="ml-1 text-xs font-normal text-muted">必填</span>
          </span>
          <AutoGrowTextarea
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (addError) setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            placeholder="例如：會議"
            className="field min-h-10 font-normal"
          />
        </label>
        {addError && (
          <p role="alert" className="text-sm text-danger">
            {addError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={add}
            disabled={adding || !name.trim()}
            className="btn btn-primary"
          >
            新增
          </button>
        </div>
      </div>

      {loadError ? (
        <p className="text-danger">載入失敗，請重新整理頁面</p>
      ) : items === null ? (
        <p className="text-muted">載入中…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          還沒有常用項目，在上方新增第一個吧
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((f, i) => (
            <FavoriteRow
              key={f.id}
              item={f}
              isFirst={i === 0}
              isLast={i === items.length - 1}
              onMove={(d) => move(f.id, d)}
              onRename={(v) => rename(f.id, v)}
              onDelete={() => remove(f.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FavoriteRow({
  item,
  isFirst,
  isLast,
  onMove,
  onRename,
  onDelete,
}: {
  item: FavoriteProject;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: "up" | "down") => void;
  onRename: (value: string) => Promise<RenameResult>;
  onDelete: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "confirm">("view");
  const [value, setValue] = useState(item.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Land on the safe choice so a stray Enter cannot delete.
  useEffect(() => {
    if (mode === "confirm") cancelRef.current?.focus();
    if (mode === "rename") inputRef.current?.focus();
  }, [mode]);

  function startRename() {
    setValue(item.name);
    setError(null);
    setMode("rename");
  }

  async function saveRename() {
    const next = value.trim();
    if (!next || busy) return;
    if (next === item.name) {
      setMode("view");
      return;
    }
    setBusy(true);
    const result = await onRename(next);
    setBusy(false);
    if (result.ok) setMode("view");
    else if (result.inline) setError(result.inline);
  }

  return (
    <li className="card flex flex-col gap-2 p-3 text-sm">
      {mode === "rename" ? (
        <>
          <AutoGrowTextarea
            textareaRef={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveRename();
              }
              if (e.key === "Escape") setMode("view");
            }}
            aria-label="常用項目名稱"
            className="field min-h-10 font-normal"
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              className="btn"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveRename}
              disabled={busy || !value.trim()}
              className="btn btn-primary"
            >
              儲存
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap break-words font-semibold leading-snug">
              {item.name}
            </p>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => onMove("up")}
                disabled={isFirst}
                aria-label="上移"
                className="btn min-h-7 px-2 py-0.5 text-xs"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove("down")}
                disabled={isLast}
                aria-label="下移"
                className="btn min-h-7 px-2 py-0.5 text-xs"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={startRename}
                className="btn min-h-7 px-2 py-0.5 text-xs"
              >
                改名
              </button>
              <button
                type="button"
                onClick={() => setMode("confirm")}
                className="btn min-h-7 px-2 py-0.5 text-xs"
              >
                刪除
              </button>
            </div>
          </div>
          {mode === "confirm" && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger-soft px-2 py-1.5"
            >
              <span className="text-xs font-medium text-danger">
                確定刪除？
              </span>
              <span className="flex gap-1">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setMode("view")}
                  onKeyDown={(e) => e.key === "Escape" && setMode("view")}
                  className="btn min-h-7 px-2 py-0.5 text-xs"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onDelete();
                    setBusy(false);
                  }}
                  className="btn btn-danger min-h-7 px-2 py-0.5 text-xs"
                >
                  確定刪除
                </button>
              </span>
            </div>
          )}
        </>
      )}
    </li>
  );
}
