"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modal confirmation built on the native <dialog>: focus is trapped, Esc and a
 * click on the backdrop cancel, and "cancel" gets the focus first so a stray
 * Enter cannot confirm a destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "確定",
  cancelLabel = "取消",
  danger,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: let our state close the dialog instead of the browser.
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {message && <p className="text-sm text-muted">{message}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="btn"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
