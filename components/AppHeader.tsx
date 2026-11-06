"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  {
    href: "/",
    label: "記事",
    match: (p: string) => p === "/",
  },
  {
    href: "/report",
    label: "週報",
    match: (p: string) => p.startsWith("/report"),
  },
  {
    href: "/favorites",
    label: "常用項目",
    match: (p: string) => p.startsWith("/favorites"),
  },
];

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-lg bg-brand text-sm text-white"
          >
            誌
          </span>
          工作日誌
        </Link>
        <nav className="flex gap-1" aria-label="主選單">
          {LINKS.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-muted hover:bg-slate-100 hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
