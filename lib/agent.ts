import { tool } from "@langchain/core/tools";
import {
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { createLLM } from "@/lib/llm";

// Sample tool: replace with your own tools.
const getCurrentTime = tool(
  async ({ timezone }) =>
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  {
    name: "get_current_time",
    description: "Get the current date and time in a given IANA timezone.",
    schema: z.object({
      timezone: z
        .string()
        .describe("IANA timezone, e.g. Asia/Taipei or America/New_York"),
    }),
  },
);

const tools = [getCurrentTime];
const llmWithTools = createLLM().bindTools(tools);

// Graph: START -> agent -> (tool calls? tools -> agent : END)
const builder = new StateGraph(MessagesAnnotation)
  .addNode("agent", async (state) => ({
    messages: [await llmWithTools.invoke(state.messages)],
  }))
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, { tools: "tools", [END]: END })
  .addEdge("tools", "agent");

// In-memory checkpointer: conversation state is lost on server restart.
// Swap for a persistent checkpointer (e.g. Postgres) in production.
const checkpointer = new MemorySaver();

export const agent = builder.compile({ checkpointer });
