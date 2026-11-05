import type { NextRequest } from "next/server";
import { handle, parseBody } from "@/lib/api";
import { todayString } from "@/lib/date";
import { syncReport } from "@/lib/reports";
import { syncReportSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseBody(request, syncReportSchema);
    if ("response" in body) return body.response;
    return Response.json(syncReport(body.data.date ?? todayString()));
  });
}
