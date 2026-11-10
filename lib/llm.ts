import { ServiceUnavailableError } from "./api";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const TIMEOUT_MS = 180_000;

/**
 * Call the LiteLLM proxy (OpenAI-compatible chat completions).
 * Server-side only: the API key never leaves the backend.
 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const baseUrl = process.env.LITELLM_BASE_URL?.replace(/\/+$/, "");
  // Optional: some gateways need no key, so no Authorization header is sent.
  const apiKey = process.env.LITELLM_API_KEY?.trim();
  const model = process.env.LITELLM_MODEL;
  if (!baseUrl || !model) {
    throw new ServiceUnavailableError("AI 服務尚未設定");
  }

  const endpoint = `${baseUrl}/v1/chat/completions`;

  // Reasoning effort defaults to "high". Set LITELLM_REASONING_EFFORT to another
  // level (low / medium), or to "off" (or empty) for models that do not accept it.
  const effort = (process.env.LITELLM_REASONING_EFFORT ?? "high").trim();
  const reasoning =
    effort && effort.toLowerCase() !== "off"
      ? { reasoning_effort: effort }
      : {};

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages, temperature: 0.2, ...reasoning }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.error("LLM request failed:", e);
    throw new ServiceUnavailableError("AI 服務暫時無法使用");
  }

  if (!res.ok) {
    console.error("LLM error:", res.status, await res.text().catch(() => ""));
    throw new ServiceUnavailableError("AI 服務暫時無法使用");
  }

  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ServiceUnavailableError("AI 沒有回傳內容，請再試一次");
  return text;
}
