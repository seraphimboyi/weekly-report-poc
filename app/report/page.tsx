import { connection } from "next/server";
import { Suspense } from "react";
import { ReportEditor } from "@/components/ReportEditor";
import { todayString } from "@/lib/date";

async function ReportContent({
  searchParams,
}: {
  searchParams: PageProps<"/report">["searchParams"];
}) {
  const { date } = await searchParams;
  // new Date() below is request-time data; opt out of prerendering first.
  await connection();
  const value =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : todayString();
  return <ReportEditor date={value} />;
}

export default function ReportPage(props: PageProps<"/report">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<p className="text-muted">載入中…</p>}>
        <ReportContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
