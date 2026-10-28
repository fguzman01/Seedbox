import { count, countDistinct, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { getDb, type Database } from "./db/client";
import { opportunities, pains, signals } from "./db/schema";
import type { Vertical } from "./pains";

export async function getSignalStats() {
  const db = getDb();
  const [[totals], [pending], [painTotals], [opportunityTotals]] = await Promise.all([
    db.select({ total: count() }).from(signals),
    db.select({ pending: count() }).from(signals).where(eq(signals.status, "pending")),
    db.select({ pains: count() }).from(pains),
    db.select({ opportunities: count() }).from(opportunities),
  ]);
  return {
    total: totals.total,
    pending: pending.pending,
    pains: painTotals.pains,
    opportunities: opportunityTotals.opportunities,
  };
}

export async function getRecentSignals(limit = 20) {
  return getDb().select().from(signals).orderBy(desc(signals.publishedAt)).limit(limit);
}

export async function getRecentPains(limit = 20) {
  return getDb()
    .select({ ...getTableColumns(pains), url: signals.url, source: signals.source })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .orderBy(desc(signals.publishedAt), pains.id)
    .limit(limit);
}

/** Evidence counts are computed on read so they never go stale (ADR-0004). */
const evidence = {
  painCount: count(pains.id),
  signalCount: countDistinct(pains.signalId),
  authorCount: countDistinct(signals.author),
  mainVertical: sql<Vertical>`mode() within group (order by ${pains.vertical})`,
};

/** Opportunities backed by the most distinct posts first. */
export async function getOpportunities(limit = 20, db: Database = getDb()) {
  return db
    .select({ ...getTableColumns(opportunities), ...evidence })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .groupBy(opportunities.id)
    .orderBy(desc(evidence.signalCount), desc(evidence.painCount), desc(opportunities.updatedAt))
    .limit(limit);
}

export async function getOpportunity(id: number, db: Database = getDb()) {
  const [opportunity] = await db
    .select({ ...getTableColumns(opportunities), ...evidence })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(eq(opportunities.id, id))
    .groupBy(opportunities.id);
  if (!opportunity) return null;

  const evidencePains = await db
    .select({
      ...getTableColumns(pains),
      url: signals.url,
      source: signals.source,
      author: signals.author,
      postTitle: signals.title,
      publishedAt: signals.publishedAt,
    })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(eq(pains.opportunityId, id))
    .orderBy(desc(signals.publishedAt), pains.id);

  return { ...opportunity, pains: evidencePains };
}
