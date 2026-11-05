/** Today's date as YYYY-MM-DD in local time. */
export function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "今天" / "昨天" / "前天" / "MM/DD" for a YYYY-MM-DD date (client use). */
export function relativeDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round(
    (today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000,
  );
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff === 2) return "前天";
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}
