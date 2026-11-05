"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastInput = {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /** Runs when the toast times out without the action being used. */
  onExpire?: () => void | Promise<void>;
  duration?: number;
};

type Item = ToastInput & { id: number };

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(
  null,
);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    const item: Item = { ...t, id };
    setItems((prev) => [...prev, item]);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setItems((prev) => prev.filter((i) => i.id !== id));
        void item.onExpire?.();
      }, t.duration ?? 4000),
    );
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-live="polite"
        aria-label="通知"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg"
          >
            <span className="min-w-0 break-words">{item.message}</span>
            {item.actionLabel && (
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 font-semibold text-blue-300 hover:bg-white/10"
                onClick={async () => {
                  remove(item.id);
                  await item.onAction?.();
                }}
              >
                {item.actionLabel}
              </button>
            )}
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}
