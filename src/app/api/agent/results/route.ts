import { connection } from "next/server";
import { agentResultsSchema, submitAgentResults } from "@/lib/agent";
import { getDb } from "@/lib/db/client";
import { rejectUnauthorized } from "../guard";

/** POST /api/agent/results with { kind, model?, results | output } (ADR-0008). */
export async function POST(request: Request) {
  await connection();
  const rejected = rejectUnauthorized(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  const parsed = agentResultsSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
    return Response.json({ error: "invalid results", issues }, { status: 400 });
  }
  return Response.json(await submitAgentResults(getDb(), parsed.data));
}
