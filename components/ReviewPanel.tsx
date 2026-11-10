"use client";

import { useEffect, useRef, useState } from "react";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { ThinkingBubble } from "./ThinkingBubble";
import { useToast } from "./Toast";

type Scope = {
  start: string | null;
  end: string | null;
  project: string | null;
};
type Message = {
  role: "user" | "assistant";
  content: string;
  scope?: Scope;
  entryCount?: number;
};

const EXAMPLES = [
  "我上個月做了什麼？",
  "幫我整理今年的績效自評素材",
  "DocExtractor 上傳頁面做到哪裡了？",
  "10/20 到 10/30 我做了什麼事情？",
];

const STORAGE_KEY = "review-chat";

const slash = (iso: string) => iso.replaceAll("-", "/");

function scopeLabel(scope: Scope, count: number) {
  const range =
    scope.start && scope.end
      ? `${slash(scope.start)}–${slash(scope.end)}`
      : "全部期間";
  return `依據 ${range}・${scope.project ?? "全部工作項目"}・${count} 筆記事`;
}

export function ReviewPanel() {
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore the conversation after mount (sessionStorage is browser-only).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed)) setMessages(parsed as Message[]);
    } catch {
      // Corrupted data: start with an empty conversation.
    }
    setRestored(true);
  }, []);

  // Persist after restoring, so the initial empty list never overwrites it.
  useEffect(() => {
    if (!restored) return;
    try {
      if (messages.length === 0) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage full or unavailable: keep working without persistence.
    }
  }, [messages, restored]);

  // Keep the newest message (or the "thinking" bubble) in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/review/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(`查詢失敗：${data?.error ?? "請再試一次"}`);
        // Take the question back so it can be sent again.
        setMessages(messages);
        setInput((cur) => cur || question);
        return;
      }
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.answer,
          scope: data.scope,
          entryCount: data.entryCount,
        },
      ]);
    } catch {
      toast.error("查詢失敗，請檢查網路後再試一次");
      setMessages(messages);
      setInput((cur) => cur || question);
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已複製內容");
    } catch {
      toast.error("複製內容失敗，請手動選取文字");
    }
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-96 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">回顧</h1>
          <p className="mt-1 text-sm text-muted">
            直接用一般說法問過去的記事，也可以請它整理月報、績效自評。內容由 AI
            依記事產生，請自行確認後再使用。
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={loading}
            className="btn shrink-0"
          >
            清除對話
          </button>
        )}
      </div>

      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        >
          {messages.length === 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">可以這樣問：</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={loading}
                    className="btn btn-ghost min-h-0 rounded-full border border-line py-1.5 text-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                key={i}
                className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-white"
              >
                {m.content}
              </div>
            ) : (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                key={i}
                className="flex max-w-[95%] flex-col gap-2 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3"
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.content}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-2">
                  <span className="text-xs text-muted">
                    {m.scope ? scopeLabel(m.scope, m.entryCount ?? 0) : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => copy(m.content)}
                    className="btn btn-ghost min-h-0 py-1 text-xs"
                  >
                    複製
                  </button>
                </div>
              </div>
            ),
          )}

          {loading && <ThinkingBubble />}
        </div>

        <div className="border-t border-line bg-surface p-3">
          <div className="flex items-end gap-2">
            <AutoGrowTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              maxLength={500}
              placeholder="例如：我上個月在 DocExtractor 做了什麼？（Enter 送出，Shift+Enter 換行）"
              aria-label="提問"
              className="field min-h-10 flex-1 font-normal"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
            >
              送出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
