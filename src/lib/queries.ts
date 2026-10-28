import { count, countDistinct, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { getDb, type Database } from "./db/client";
import { notes, opportunities, pains, signals } from "./db/schema";
import { getNotes } from "./notes";
import type { Vertical } from "./pains";
import { axisScores, totalScore, type Weights } from "./scoring";

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
    .select({
      ...getTableColumns(pains),
      url: signals.url,
      source: signals.source,
      sourceMetadata: signals.metadata,
    })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .orderBy(desc(signals.publishedAt), pains.id)
    .limit(limit);
}

const countWhere = (condition: ReturnType<typeof sql>) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

/** Evidence counts are computed on read so they never go stale (ADR-0004, ADR-0005). */
const evidence = {
  painCount: count(pains.id),
  signalCount: countDistinct(pains.signalId),
  authorCount: countDistinct(signals.author),
  mainVertical: sql<Vertical>`mode() within group (order by ${pains.vertical})`,
  intensityLow: countWhere(sql`${pains.intensity} = 'low'`),
  intensityMedium: countWhere(sql`${pains.intensity} = 'medium'`),
  intensityHigh: countWhere(sql`${pains.intensity} = 'high'`),
  willingnessNone: countWhere(sql`${pains.willingnessToPay} = 'none'`),
  willingnessImplied: countWhere(sql`${pains.willingnessToPay} = 'implied'`),
  willingnessExplicit: countWhere(sql`${pains.willingnessToPay} = 'explicit'`),
  verticals: sql<Vertical[]>`array_agg(distinct ${pains.vertical})`,
  // A subquery, so joining notes does not multiply the pain rows above.
  noteCount: sql<number>`(select count(*) from ${notes} where ${notes.opportunityId} = ${opportunities.id})`.mapWith(Number),
};

/** The most telling pain first: strongest intensity, then explicit willingness to pay. */
const strongestFirst = sql`
  case ${pains.intensity} when 'high' then 0 when 'medium' then 1 else 2 end,
  case ${pains.willingnessToPay} when 'explicit' then 0 when 'implied' then 1 else 2 end,
  ${pains.id}`;

const representative = {
  topQuote: sql<string>`(array_agg(${pains.quote} order by ${strongestFirst}))[1]`,
  topQuoteUrl: sql<string>`(array_agg(${signals.url} order by ${strongestFirst}))[1]`,
};

function withScores<T extends Parameters<typeof axisScores>[0] & Parameters<typeof axisScores>[1]>(
  row: T,
  weights: Weights,
) {
  const axes = axisScores(row, row);
  return { ...row, axes, score: totalScore(axes, weights) };
}

/** All opportunities, best total score first for the given weights (ADR-0005). */
export async function getOpportunities(weights: Weights, db: Database = getDb()) {
  const rows = await db
    .select({ ...getTableColumns(opportunities), ...evidence, ...representative })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .groupBy(opportunities.id);

  return rows
    .map((row) => withScores(row, weights))
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        b.signalCount - a.signalCount ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
}

export async function getOpportunity(id: number, weights: Weights, db: Database = getDb()) {
  const [row] = await db
    .select({ ...getTableColumns(opportunities), ...evidence })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(eq(opportunities.id, id))
    .groupBy(opportunities.id);
  if (!row) return null;
  const opportunity = withScores(row, weights);

  const evidencePains = await db
    .select({
      ...getTableColumns(pains),
      url: signals.url,
      source: signals.source,
      sourceMetadata: signals.metadata,
      author: signals.author,
      postTitle: signals.title,
      publishedAt: signals.publishedAt,
    })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(eq(pains.opportunityId, id))
    .orderBy(desc(signals.publishedAt), pains.id);

  return { ...opportunity, pains: evidencePains, notes: await getNotes(db, id) };
}
