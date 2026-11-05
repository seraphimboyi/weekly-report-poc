"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

type Props = Omit<React.ComponentProps<"textarea">, "ref" | "rows"> & {
  /** Gives the parent access to the underlying textarea element. */
  textareaRef?: React.Ref<HTMLTextAreaElement>;
};

/**
 * A textarea whose height follows its content (no inner scrollbar, no manual
 * resize handle). Works in every browser, unlike CSS `field-sizing`.
 */
export function AutoGrowTextarea({
  className,
  value,
  textareaRef,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      ref.current = el;
      if (typeof textareaRef === "function") textareaRef(el);
      else if (textareaRef) {
        (textareaRef as React.RefObject<HTMLTextAreaElement | null>).current =
          el;
      }
    },
    [textareaRef],
  );

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight excludes the border; add it back for border-box sizing.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, []);

  // Re-measure whenever the text changes...
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the trigger
  useLayoutEffect(resize, [value, resize]);

  // ...and when the width changes (lines wrap differently).
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return (
    <textarea
      {...rest}
      ref={setRef}
      rows={1}
      value={value}
      className={`${className ?? ""} resize-none overflow-hidden`}
    />
  );
}
