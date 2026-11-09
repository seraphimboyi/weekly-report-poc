"use client";

import { useEffect, useState } from "react";

const SLOW_AFTER_SECONDS = 15;

/**
 * "AI is working" bubble: bouncing dots plus an elapsed-seconds counter, and a
 * hint once it takes long. Mount it only while waiting so the timer restarts
 * for every question. Dots stop animating under prefers-reduced-motion
 * (globals.css), leaving the text and counter.
 */
export function ThinkingBubble() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <output className="flex max-w-[95%] flex-col gap-1 self-start rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 text-sm text-muted">
      {/* Screen readers get one fixed message, not a count every second. */}
      <span className="sr-only">AI 整理中，請稍候</span>
      <span aria-hidden className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-brand/70"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span>AI 整理中</span>
        <span className="tabular-nums text-xs">{seconds} 秒</span>
      </span>
      {seconds >= SLOW_AFTER_SECONDS && (
        <span aria-hidden className="text-xs">
          回答較長或模型正在思考，請再稍候一下
        </span>
      )}
    </output>
  );
}
