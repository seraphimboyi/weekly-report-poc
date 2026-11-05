import type { NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { applyLatest } from "@/lib/reports";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/reports/[id]/apply">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    return Response.json(applyLatest(parsed.id));
  });
}
