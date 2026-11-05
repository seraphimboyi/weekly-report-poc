import { Suspense } from "react";
import { WeekBoard } from "@/components/WeekBoard";

async function Board({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const { date } = await searchParams;
  const valid = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return <WeekBoard date={valid ? date : null} />;
}

export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<p className="text-muted">載入中…</p>}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
