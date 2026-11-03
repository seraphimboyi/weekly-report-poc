import { ChatOpenAI } from "@langchain/openai";

// LiteLLM proxy exposes an OpenAI-compatible API, so ChatOpenAI works with a custom baseURL.
export function createLLM() {
  return new ChatOpenAI({
    model: process.env.LITELLM_MODEL ?? "gpt-4o",
    apiKey: process.env.LITELLM_API_KEY ?? "sk-sample-key",
    temperature: 0.7,
    configuration: {
      baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
    },
  });
}
