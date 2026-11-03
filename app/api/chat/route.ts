import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createLLM } from "@/lib/llm";

export const runtime = "nodejs";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant."],
  ["human", "{input}"],
]);

export async function POST(req: Request) {
  const { message } = (await req.json()) as { message?: string };

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const chain = prompt.pipe(createLLM()).pipe(new StringOutputParser());
  const stream = await chain.stream({ input: message });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
