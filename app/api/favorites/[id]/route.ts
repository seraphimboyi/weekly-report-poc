import type { NextRequest } from "next/server";
import { handle, parseBody, parseId } from "@/lib/api";
import { deleteFavorite, moveFavorite, renameFavorite } from "@/lib/favorites";
import { updateFavoriteSchema } from "@/lib/validators";

// Rename with `name`, or reorder with `move` (returns the whole new order).
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/favorites/[id]">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    const body = await parseBody(request, updateFavoriteSchema);
    if ("response" in body) return body.response;
    if (body.data.move) {
      return Response.json(moveFavorite(parsed.id, body.data.move));
    }
    return Response.json(renameFavorite(parsed.id, body.data.name as string));
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/favorites/[id]">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;
    deleteFavorite(parsed.id);
    return new Response(null, { status: 204 });
  });
}
