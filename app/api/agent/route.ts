import { agent } from "@/lib/agent";
import { agentBodySchema, parseBody } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const result = await parseBody(req, agentBodySchema);
  if ("error" in result) return result.error;
  const { message, threadId } = result.data;

  const id = threadId ?? crypto.randomUUID();

  const stream = await agent.stream(
    { messages: [{ role: "user", content: message }] },
    { configurable: { thread_id: id }, streamMode: "messages" },
  );

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const [chunk, metadata] of stream) {
          // Only forward text tokens produced by the "agent" node.
          if (
            metadata.langgraph_node === "agent" &&
            typeof chunk.content === "string" &&
            chunk.content
          ) {
            controller.enqueue(encoder.encode(chunk.content));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Thread-Id": id,
    },
  });
}
