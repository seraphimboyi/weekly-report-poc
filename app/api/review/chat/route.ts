import type { NextRequest } from "next/server";
import { errorResponse, handle, parseBody } from "@/lib/api";
import { chatReview } from "@/lib/review";
import { chatReviewSchema } from "@/lib/validators";

// Natural-language chat over the user's entries. The scope (dates, work item)
// is worked out from the conversation itself.
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseBody(request, chatReviewSchema);
    if ("response" in body) return body.response;
    const { messages } = body.data;
    if (messages[messages.length - 1].role !== "user") {
      return errorResponse(400, "最後一則訊息必須是使用者的提問");
    }
    return Response.json(await chatReview(messages));
  });
}
