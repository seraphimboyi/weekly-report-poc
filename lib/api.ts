import { z } from "zod";
import { idSchema } from "./validators";

export function errorResponse(
  status: number,
  message: string,
  details?: unknown,
) {
  return Response.json({ error: message, details }, { status });
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class BadRequestError extends Error {}
export class ServiceUnavailableError extends Error {}

/** Parse a JSON body with a zod schema; returns data or a 400 Response. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { response: errorResponse(400, "請求內容不是有效的 JSON") };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      response: errorResponse(
        400,
        "輸入驗證失敗",
        z.flattenError(result.error),
      ),
    };
  }
  return { data: result.data };
}

export function parseId(raw: string): { id: number } | { response: Response } {
  const result = idSchema.safeParse(raw);
  if (!result.success) return { response: errorResponse(400, "無效的 id") };
  return { id: result.data };
}

/** Wrap a handler: map NotFoundError to 404 and anything else to 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotFoundError) return errorResponse(404, e.message);
    if (e instanceof ConflictError) return errorResponse(409, e.message);
    if (e instanceof BadRequestError) return errorResponse(400, e.message);
    if (e instanceof ServiceUnavailableError)
      return errorResponse(502, e.message);
    console.error(e);
    return errorResponse(500, "伺服器發生未預期的錯誤");
  }
}
