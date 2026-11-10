import type { NextRequest } from "next/server";
import { errorResponse, handle, parseBody } from "@/lib/api";
import { todayString } from "@/lib/date";
import { createEntry, listEntries, weekRange } from "@/lib/entries";
import { createEntrySchema, listEntriesQuerySchema } from "@/lib/validators";

// Entries of the week containing `date` (default: today), Wednesday to next Tuesday (per WEEK_CONFIG).
export async function GET(request: NextRequest) {
  return handle(async () => {
    const q = listEntriesQuerySchema.safeParse({
      date: request.nextUrl.searchParams.get("date") ?? undefined,
    });
    if (!q.success) return errorResponse(400, "無效的 date 參數");
    const { start, end } = weekRange(q.data.date ?? todayString());
    return Response.json({
      weekStart: start,
      weekEnd: end,
      entries: listEntries(start, end),
    });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseBody(request, createEntrySchema);
    if ("response" in body) return body.response;
    return Response.json(createEntry(body.data), { status: 201 });
  });
}
