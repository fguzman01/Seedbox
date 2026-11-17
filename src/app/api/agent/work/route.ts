import { connection } from "next/server";
import {
  clampLimit,
  clampShortlistLimit,
  getAgentStatus,
  getAgentWork,
  getShortlistWork,
  parseExcludeIds,
  SHORTLIST_KIND,
  WORK_KINDS,
  type WorkKind,
} from "@/lib/agent";
import { clampStatsDays, getAgentStats } from "@/lib/agent-stats";
import { getDb } from "@/lib/db/client";
import { rejectUnauthorized } from "../guard";

/** GET /api/agent/work?kind=status|extract|cluster|assess|shortlist|stats&limit=N&exclude=1,2 (shortlist only)&days=N (stats only, read-only) (ADR-0008). */
export async function GET(request: Request) {
  await connection();
  const rejected = rejectUnauthorized(request);
  if (rejected) return rejected;

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "status";
  if (kind === "status") return Response.json(await getAgentStatus(getDb()));
  if (kind === "stats") return Response.json(await getAgentStats(getDb(), clampStatsDays(params.get("days"))));
  if (kind === SHORTLIST_KIND) {
    return Response.json(await getShortlistWork(getDb(), clampShortlistLimit(params.get("limit")), parseExcludeIds(params.get("exclude"))));
  }
  if (!(WORK_KINDS as readonly string[]).includes(kind)) {
    return Response.json({ error: `kind must be status, ${WORK_KINDS.join(", ")}, ${SHORTLIST_KIND}, stats` }, { status: 400 });
  }
  const workKind = kind as WorkKind;
  return Response.json(await getAgentWork(getDb(), workKind, clampLimit(workKind, params.get("limit"))));
}
