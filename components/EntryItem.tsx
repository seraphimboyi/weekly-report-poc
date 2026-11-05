"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/db/schema";

type Props = {
  entry: Entry;
  onEdit: () => void;
  /** Deletes right away; the confirmation step lives in this component. */
  onDelete: () => void | Promise<void>;
};

export function EntryItem({ entry, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Land on the safe choice so a stray Enter cannot delete.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  return (
    <li className="rounded-lg border border-line border-l-4 border-l-brand bg-surface p-2.5 text-sm">
      {entry.project && (
        <p className="whitespace-pre-wrap break-words font-semibold leading-snug text-brand">
          {entry.project}
        </p>
      )}
      {entry.content && (
        <p
          className={`whitespace-pre-wrap break-words leading-relaxed ${entry.project ? "mt-0.5 text-muted" : ""}`}
        >
          {entry.content}
        </p>
      )}
      {confirming ? (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger-soft px-2 py-1.5"
        >
          <span className="text-xs font-medium text-danger">確定刪除？</span>
          <span className="flex gap-1">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
              className="btn min-h-7 px-2 py-0.5 text-xs"
            >
              取消
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                await onDelete();
                setDeleting(false);
                setConfirming(false);
              }}
              className="btn min-h-7 border-danger bg-danger px-2 py-0.5 text-xs text-white hover:bg-red-800"
            >
              {deleting ? "刪除中…" : "刪除"}
            </button>
          </span>
        </div>
      ) : (
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="btn btn-ghost min-h-7 px-2 py-0.5 text-xs"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-ghost min-h-7 px-2 py-0.5 text-xs hover:text-danger"
          >
            刪除
          </button>
        </div>
      )}
    </li>
  );
}
