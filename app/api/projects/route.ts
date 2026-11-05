import { connection } from "next/server";
import { handle } from "@/lib/api";
import { listProjects } from "@/lib/entries";

// Recently used work item names with their latest progress / due date.
export async function GET() {
  // Read live data on every request instead of prerendering at build time.
  await connection();
  return handle(async () => Response.json(listProjects()));
}
