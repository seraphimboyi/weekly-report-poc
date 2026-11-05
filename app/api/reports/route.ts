import type { NextRequest } from "next/server";
import { errorResponse, handle, parseBody } from "@/lib/api";
import { todayString } from "@/lib/date";
import { createReport, findReport } from "@/lib/reports";
import { createReportSchema, getReportQuerySchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const q = getReportQuerySchema.safeParse({
      date: request.nextUrl.searchParams.get("date") ?? undefined,
    });
    if (!q.success) return errorResponse(400, "無效的 date 參數");
    return Response.json(findReport(q.data.date ?? todayString()));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseBody(request, createReportSchema);
    if ("response" in body) return body.response;
    const report = createReport(
      body.data.date ?? todayString(),
      body.data.force ?? false,
    );
    return Response.json(report, { status: 201 });
  });
}
