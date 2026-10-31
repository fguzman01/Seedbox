import { connection } from "next/server";
import { clampLimit, getAgentStatus, getAgentWork, WORK_KINDS, type WorkKind } from "@/lib/agent";
import { getDb } from "@/lib/db/client";
import { rejectUnauthorized } from "../guard";

/** GET /api/agent/work?kind=status|extract|cluster|assess&limit=N (ADR-0008). */
export async function GET(request: Request) {
  await connection();
  const rejected = rejectUnauthorized(request);
  if (rejected) return rejected;

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "status";
  if (kind === "status") return Response.json(await getAgentStatus(getDb()));
  if (!(WORK_KINDS as readonly string[]).includes(kind)) {
    return Response.json({ error: `kind must be status, ${WORK_KINDS.join(", ")}` }, { status: 400 });
  }
  const workKind = kind as WorkKind;
  return Response.json(await getAgentWork(getDb(), workKind, clampLimit(workKind, params.get("limit"))));
}
