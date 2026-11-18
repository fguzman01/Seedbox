import { countDistinct, eq, gte } from "drizzle-orm";
import type { Database } from "./db/client";
import { opportunities, pains } from "./db/schema";
import type { Vertical } from "./pains";
import { DEV_VERTICAL, getLastIngestRuns, getPainCounts, getSignalCounts, MIX_DAYS, mixWindowStart, buildSourceMix, type SourceMix } from "./source-mix";
import { getShortlist } from "./shortlist";
import { SOURCE_IDS } from "./sources";

/**
 * Radar numbers for the agents (H25): the same counts the /activity view (H14) shows, readable
 * through the agent API. Only counts, percentages and dates: no post text, no author names.
 */

export const STATS_MAX_DAYS = 365;

/** Clamps the `days` query value to 1..365; the default is the H14 window. */
export function clampStatsDays(raw: string | null | undefined): number {
  const n = Number(raw);
  if (raw == null || raw === "" || !Number.isInteger(n) || n < 1) return MIX_DAYS;
  return Math.min(STATS_MAX_DAYS, n);
}

export interface AgentStats {
  days: number;
  since: string;
  generatedAt: string;
  posts: { ingested: number; pains: number };
  sources: SourceMix[];
  painsByVertical: { vertical: Vertical; pains: number; percent: number }[];
  devPains: { vertical: Vertical; pains: number; percent: number | null };
  opportunitiesByVertical: { vertical: Vertical; opportunities: number }[];
  shortlist: { size: number; distinctAuthors: number[] };
}

export async function getAgentStats(db: Database, days = MIX_DAYS, now = new Date()): Promise<AgentStats> {
  const since = mixWindowStart(now, days);
  const [signalRows, painRows, lastRuns, oppRows, shortlist] = await Promise.all([
    getSignalCounts(db, since),
    getPainCounts(db, since),
    getLastIngestRuns(db),
    db
      .select({ vertical: pains.vertical, opportunities: countDistinct(pains.opportunityId) })
      .from(pains)
      .innerJoin(opportunities, eq(pains.opportunityId, opportunities.id))
      .where(gte(opportunities.createdAt, since))
      .groupBy(pains.vertical),
    getShortlist(db).then((result) => result.items),
  ]);
  const mix = buildSourceMix({ knownSources: SOURCE_IDS, signalRows, painRows, lastRuns, days });

  const byVertical = new Map<Vertical, number>();
  for (const row of painRows) byVertical.set(row.vertical, (byVertical.get(row.vertical) ?? 0) + row.pains);
  const total = mix.pains;
  const painsByVertical = [...byVertical.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([vertical, n]) => ({ vertical, pains: n, percent: total > 0 ? Math.round((n / total) * 100) : 0 }));
  const dev = byVertical.get(DEV_VERTICAL) ?? 0;

  return {
    days,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    posts: { ingested: mix.ingested, pains: mix.pains },
    sources: mix.sources,
    painsByVertical,
    devPains: { vertical: DEV_VERTICAL, pains: dev, percent: total > 0 ? Math.round((dev / total) * 100) : null },
    opportunitiesByVertical: oppRows
      .map((r) => ({ vertical: r.vertical, opportunities: Number(r.opportunities) }))
      .sort((a, b) => b.opportunities - a.opportunities || a.vertical.localeCompare(b.vertical)),
    shortlist: { size: shortlist.length, distinctAuthors: shortlist.map((s) => s.authorCount) },
  };
}
