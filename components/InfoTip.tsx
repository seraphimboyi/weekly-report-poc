"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  /** Accessible name of the trigger button. */
  label: string;
  /** Trigger content; defaults to a small "?" badge. */
  trigger?: React.ReactNode;
  triggerClassName?: string;
  /** Popover side relative to the trigger. */
  align?: "left" | "right";
  children: React.ReactNode;
};

const DEFAULT_TRIGGER =
  "inline-flex size-5 cursor-help items-center justify-center rounded-full border border-brand/30 bg-brand-soft text-[11px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand hover:text-white aria-expanded:border-brand aria-expanded:bg-brand aria-expanded:text-white";

/**
 * Small popover for secondary help text (and light actions).
 * Mouse: shows on hover. Keyboard: shows on focus. Touch: tap to toggle.
 * Esc or a click elsewhere closes it.
 */
export function InfoTip({
  label,
  trigger,
  triggerClassName,
  align = "left",
  children,
}: Props) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focused || pinned;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) {
        setPinned(false);
        setHover(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setHover(false);
        setFocused(false);
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/blur only mirror the trigger button, which carries the semantics
    <span
      ref={ref}
      className="relative inline-flex"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) {
          setFocused(false);
          setPinned(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setPinned((p) => !p)}
        onFocus={(e) => {
          // Only keyboard focus opens it; a mouse click is handled by onClick.
          if (e.currentTarget.matches(":focus-visible")) setFocused(true);
        }}
        className={triggerClassName ?? DEFAULT_TRIGGER}
      >
        {trigger ?? "?"}
      </button>
      {/* pt-1 instead of margin keeps the pointer inside while moving over. */}
      <span
        id={id}
        hidden={!open}
        className={`absolute top-full z-30 pt-1 ${align === "right" ? "right-0" : "left-0"}`}
      >
        <span className="card block w-64 max-w-[calc(100vw-2rem)] p-3 text-xs font-normal leading-relaxed text-ink shadow-lg">
          {children}
        </span>
      </span>
    </span>
  );
}
