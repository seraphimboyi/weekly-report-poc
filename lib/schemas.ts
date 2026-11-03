import { z } from "zod";

const message = z.string().trim().min(1).max(4000);

export const chatBodySchema = z.object({ message });

export const agentBodySchema = z.object({
  message,
  threadId: z.string().min(1).max(128).optional(),
});

// Parse a request body; returns a 400 Response on invalid JSON or schema mismatch.
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return {
      error: Response.json(
        {
          error: "Invalid request body",
          details: z.treeifyError(parsed.error),
        },
        { status: 400 },
      ),
    };
  }

  return { data: parsed.data };
}
