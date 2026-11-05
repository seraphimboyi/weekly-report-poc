"use client";

import { useEffect, useRef } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

export function TaskMenu({ items }: { items: MenuItem[] }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label="更多操作"
        className="btn btn-ghost size-9 min-h-0 cursor-pointer list-none p-0 text-lg [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div className="card absolute right-0 z-20 mt-1 w-36 p-1 shadow-lg">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              if (ref.current) ref.current.open = false;
              item.onSelect();
            }}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${item.danger ? "text-danger hover:bg-danger-soft" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
