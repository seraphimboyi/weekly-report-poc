import type { NextRequest } from "next/server";
import { handle, parseBody, parseId } from "@/lib/api";
import { deleteEntry, updateEntry } from "@/lib/entries";
import { updateEntrySchema } from "@/lib/validators";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/entries/[id]">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    const body = await parseBody(request, updateEntrySchema);
    if ("response" in body) return body.response;
    return Response.json(updateEntry(parsed.id, body.data));
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/entries/[id]">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    deleteEntry(parsed.id);
    return new Response(null, { status: 204 });
  });
}
