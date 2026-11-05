import type { NextRequest } from "next/server";
import { handle, parseBody, parseId } from "@/lib/api";
import { getReport, saveReportContent } from "@/lib/reports";
import { updateReportSchema } from "@/lib/validators";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/reports/[id]">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    return Response.json(getReport(parsed.id));
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/reports/[id]">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    const body = await parseBody(request, updateReportSchema);
    if ("response" in body) return body.response;
    return Response.json(saveReportContent(parsed.id, body.data.content));
  });
}
