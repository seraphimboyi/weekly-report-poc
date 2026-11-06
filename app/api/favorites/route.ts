import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { handle, parseBody } from "@/lib/api";
import { createFavorite, listFavorites } from "@/lib/favorites";
import { createFavoriteSchema } from "@/lib/validators";

export async function GET() {
  // Read live data on every request instead of prerendering at build time.
  await connection();
  return handle(async () => Response.json(listFavorites()));
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseBody(request, createFavoriteSchema);
    if ("response" in body) return body.response;
    return Response.json(createFavorite(body.data.name), { status: 201 });
  });
}
