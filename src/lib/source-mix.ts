import { and, count, desc, eq, getTableColumns, gte, ne, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "./db/client";
import { ingestRuns, pains, signals, type IngestRunStatus } from "./db/schema";
import { VERTICALS, type Vertical } from "./pains";
import { feedLabel } from "./sources/types";

/**
 * Where the radar's input comes from (H14): per source, and per feed (subreddit in Reddit, site in
 * Stack Exchange), how many posts came in, got processed or discarded and how many pains they
 * produced over the last 30 days, plus the pains' vertical mix. Only counts, percentages and dates.
 */

export const MIX_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The vertical whose share tells whether the radar is biased towards developers. */
export const DEV_VERTICAL: Vertical = "devtools";

const SOURCE_NAMES: Record<string, string> = {
  hackernews: "Hacker News",
  reddit: "Reddit",
  stackexchange: "Stack Exchange",
};

export function sourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}

export function mixWindowStart(now: Date, days = MIX_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Rounded percentage of `part` over `total`; null when there is nothing to divide. */
export function percent(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}

// ---------------------------------------------------------------------------------------------
// Aggregation (pure)

/** Signal counts for one source and feed (null for single-feed sources such as Hacker News). */
export interface SignalCountRow {
  source: string;
  feed: string | null;
  ingested: number;
  processed: number;
  discarded: number;
}

export interface PainCountRow {
  source: string;
  feed: string | null;
  vertical: Vertical;
  pains: number;
}

export interface LastIngestRun {
  source: string;
  status: IngestRunStatus;
  fetched: number;
  inserted: number;
  ranAt: Date;
}

/**
 * - ok: the last `ingest` ran the source.
 * - not_configured: the last `ingest` skipped it for lack of configuration.
 * - error: the last `ingest` of the source failed.
 * - unknown: no run recorded (never ingested, or ingested before runs were recorded).
 */
export type SourceState = "ok" | "not_configured" | "error" | "unknown";

export function sourceState(lastRun: Pick<LastIngestRun, "status"> | null | undefined): SourceState {
  if (!lastRun) return "unknown";
  if (lastRun.status === "skipped") return "not_configured";
  return lastRun.status;
}

export interface VerticalShare {
  vertical: Vertical;
  pains: number;
  percent: number;
}

export interface MixCounts {
  ingested: number;
  /** Extraction finished in the window: with pains or discarded (same meaning as in H10). */
  processed: number;
  /** Processed without pains. */
  discarded: number;
  pains: number;
  /** Verticals with at least one pain, most pains first. */
  verticals: VerticalShare[];
  /** Share of pains in "Herramientas para devs"; null without pains. */
  devPercent: number | null;
}

export interface FeedMix extends MixCounts {
  feed: string;
}

export interface SourceMix extends MixCounts {
  source: string;
  name: string;
  state: SourceState;
  lastRun: LastIngestRun | null;
  /** Share of all posts ingested in the window that came from this source. */
  ingestedPercent: number | null;
  feeds: FeedMix[];
}

export interface SourceMixSummary {
  days: number;
  ingested: number;
  pains: number;
  sources: SourceMix[];
}

function summarize(signalRows: SignalCountRow[], painRows: PainCountRow[]): MixCounts {
  const sum = (key: "ingested" | "processed" | "discarded") => signalRows.reduce((n, r) => n + r[key], 0);
  const byVertical = new Map<Vertical, number>();
  for (const row of painRows) byVertical.set(row.vertical, (byVertical.get(row.vertical) ?? 0) + row.pains);
  const total = [...byVertical.values()].reduce((a, b) => a + b, 0);
  const verticals = [...byVertical.entries()]
    .filter(([, n]) => n > 0)
    .sort(([va, a], [vb, b]) => b - a || VERTICALS.indexOf(va) - VERTICALS.indexOf(vb))
    .map(([vertical, n]) => ({ vertical, pains: n, percent: percent(n, total) ?? 0 }));
  return {
    ingested: sum("ingested"),
    processed: sum("processed"),
    discarded: sum("discarded"),
    pains: total,
    verticals,
    devPercent: percent(byVertical.get(DEV_VERTICAL) ?? 0, total),
  };
}

/**
 * Builds the per-source view. Known sources (the configured adapters) always appear, in their
 * order, even with no posts or runs; any other source with data or runs follows alphabetically.
 */
export function buildSourceMix({
  knownSources,
  signalRows,
  painRows,
  lastRuns,
  days = MIX_DAYS,
}: {
  knownSources: readonly string[];
  signalRows: SignalCountRow[];
  painRows: PainCountRow[];
  lastRuns: LastIngestRun[];
  days?: number;
}): SourceMixSummary {
  const extra = new Set<string>();
  for (const row of [...signalRows, ...painRows, ...lastRuns]) {
    if (!knownSources.includes(row.source)) extra.add(row.source);
  }
  const ids = [...knownSources, ...[...extra].sort()];
  const totalIngested = signalRows.reduce((n, r) => n + r.ingested, 0);

  const sources = ids.map((source): SourceMix => {
    const ownSignals = signalRows.filter((r) => r.source === source);
    const ownPains = painRows.filter((r) => r.source === source);
    const lastRun = lastRuns.find((r) => r.source === source) ?? null;
    const feedNames = [
      ...new Set([...ownSignals, ...ownPains].map((r) => r.feed).filter((s): s is string => s !== null)),
    ];
    const feeds = feedNames
      .map((feed) => ({
        feed,
        ...summarize(
          ownSignals.filter((r) => r.feed === feed),
          ownPains.filter((r) => r.feed === feed),
        ),
      }))
      .sort((a, b) => b.ingested - a.ingested || b.pains - a.pains || a.feed.localeCompare(b.feed));
    const counts = summarize(ownSignals, ownPains);
    return {
      source,
      name: sourceName(source),
      state: sourceState(lastRun),
      lastRun,
      ...counts,
      ingestedPercent: percent(counts.ingested, totalIngested),
      feeds,
    };
  });

  return { days, ingested: totalIngested, pains: sources.reduce((n, s) => n + s.pains, 0), sources };
}

// ---------------------------------------------------------------------------------------------
// Links from each number to the matching list on /activity

export const POST_STAGES = ["ingested", "processed", "discarded"] as const;
export type PostStage = (typeof POST_STAGES)[number];

/** The list behind a number: posts or pains, narrowed by source, feed, vertical and stage. */
export interface ActivityFilter {
  list: "posts" | "pains";
  source?: string;
  feed?: string;
  /** Pains only. */
  vertical?: Vertical;
  /** Posts only; "ingested" when absent. */
  stage?: PostStage;
  /** Rolling window in days; all time when absent. */
  days?: number;
}

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/;
const FEED_PATTERN = /^[A-Za-z0-9_.-]{1,60}$/;

/** Reads the list filter from the query string; null when no list is requested. Invalid values are ignored. */
export function parseActivityFilter(params: Params): ActivityFilter | null {
  const list = first(params.ver);
  if (list !== "posts" && list !== "dolores") return null;
  const filter: ActivityFilter = { list: list === "posts" ? "posts" : "pains" };
  const source = first(params.source);
  if (source && SOURCE_PATTERN.test(source)) filter.source = source;
  const feed = first(params.sub);
  if (feed && FEED_PATTERN.test(feed)) filter.feed = feed;
  const days = Number(first(params.days));
  if (Number.isInteger(days) && days > 0 && days <= 365) filter.days = days;
  if (filter.list === "pains") {
    const vertical = first(params.vertical);
    if ((VERTICALS as string[]).includes(vertical ?? "")) filter.vertical = vertical as Vertical;
  } else {
    const stage = first(params.estado);
    if ((POST_STAGES as readonly string[]).includes(stage ?? "")) filter.stage = stage as PostStage;
  }
  return filter;
}

export const ACTIVITY_LIST_ID = "lista";

export function activityHref(filter: ActivityFilter): string {
  const params = new URLSearchParams({ ver: filter.list === "posts" ? "posts" : "dolores" });
  if (filter.source) params.set("source", filter.source);
  if (filter.feed) params.set("sub", filter.feed);
  if (filter.list === "pains" && filter.vertical) params.set("vertical", filter.vertical);
  if (filter.list === "posts" && filter.stage && filter.stage !== "ingested") params.set("estado", filter.stage);
  if (filter.days) params.set("days", String(filter.days));
  return `/activity?${params}#${ACTIVITY_LIST_ID}`;
}

const STAGE_TEXT: Record<PostStage, string> = {
  ingested: "ingresados",
  processed: "procesados",
  discarded: "descartados (sin dolores)",
};

/** "Posts de r/SaaS descartados (sin dolores) en los últimos 30 días", for the list heading. */
export function describeActivityFilter(filter: ActivityFilter, verticalLabel: (v: Vertical) => string): string {
  const parts = [filter.list === "posts" ? "Posts" : "Dolores"];
  if (filter.feed && filter.source && filter.source !== "reddit") {
    parts.push(`de ${feedLabel(filter.source, filter.feed)} (${sourceName(filter.source)})`);
  } else if (filter.feed) parts.push(`de ${feedLabel("reddit", filter.feed)}`);
  else if (filter.source) parts.push(`de ${sourceName(filter.source)}`);
  if (filter.list === "posts") parts.push(STAGE_TEXT[filter.stage ?? "ingested"]);
  if (filter.list === "pains" && filter.vertical) parts.push(`en ${verticalLabel(filter.vertical)}`);
  if (filter.list === "pains") parts.push("extraídos");
  if (filter.days) parts.push(`en los últimos ${filter.days} días`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------------------------
// Queries

/** The feed of a signal (subreddit or Stack Exchange site), like `feedOf` in sources/types.ts. */
const feedSql = sql<string | null>`coalesce(${signals.metadata}->>'subreddit', ${signals.metadata}->>'site')`;
const countWhere = (condition: SQL | undefined) => sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

/**
 * Per source and feed, within the window: posts in (by `fetched_at`), and posts whose
 * extraction finished (by `processed_at`): processed = with pains or discarded, discarded = no pains.
 */
export async function getSignalCounts(db: Database, since: Date): Promise<SignalCountRow[]> {
  const finished = and(ne(signals.status, "pending"), gte(signals.processedAt, since));
  return db
    .select({
      source: signals.source,
      feed: feedSql,
      ingested: countWhere(gte(signals.fetchedAt, since)),
      processed: countWhere(finished),
      discarded: countWhere(and(eq(signals.status, "discarded"), gte(signals.processedAt, since))),
    })
    .from(signals)
    .where(or(gte(signals.fetchedAt, since), finished))
    .groupBy(signals.source, feedSql);
}

/** Pains extracted within the window (by the pain's `created_at`), per source, feed and vertical. */
export async function getPainCounts(db: Database, since: Date): Promise<PainCountRow[]> {
  return db
    .select({ source: signals.source, feed: feedSql, vertical: pains.vertical, pains: count() })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(gte(pains.createdAt, since))
    .groupBy(signals.source, feedSql, pains.vertical);
}

/** The most recent recorded `ingest` run of each source. */
export async function getLastIngestRuns(db: Database): Promise<LastIngestRun[]> {
  return db
    .selectDistinctOn([ingestRuns.source], {
      source: ingestRuns.source,
      status: ingestRuns.status,
      fetched: ingestRuns.fetched,
      inserted: ingestRuns.inserted,
      ranAt: ingestRuns.ranAt,
    })
    .from(ingestRuns)
    .orderBy(ingestRuns.source, desc(ingestRuns.ranAt), desc(ingestRuns.id));
}

export async function getSourceMix(
  db: Database,
  knownSources: readonly string[],
  now = new Date(),
  days = MIX_DAYS,
): Promise<SourceMixSummary> {
  const since = mixWindowStart(now, days);
  const [signalRows, painRows, lastRuns] = await Promise.all([
    getSignalCounts(db, since),
    getPainCounts(db, since),
    getLastIngestRuns(db),
  ]);
  return buildSourceMix({ knownSources, signalRows, painRows, lastRuns, days });
}

export const ACTIVITY_LIST_LIMIT = 200;

function sourceConditions(filter: ActivityFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.source) conditions.push(eq(signals.source, filter.source));
  if (filter.feed) conditions.push(sql`${feedSql} = ${filter.feed}`);
  return conditions;
}

/** The posts behind a post count, newest first; same definitions as getSignalCounts. */
export async function getFilteredSignals(db: Database, filter: ActivityFilter, now = new Date(), limit = ACTIVITY_LIST_LIMIT) {
  const conditions = sourceConditions(filter);
  const since = filter.days ? mixWindowStart(now, filter.days) : null;
  const stage = filter.stage ?? "ingested";
  if (stage === "processed") conditions.push(ne(signals.status, "pending"));
  if (stage === "discarded") conditions.push(eq(signals.status, "discarded"));
  if (since) conditions.push(gte(stage === "ingested" ? signals.fetchedAt : signals.processedAt, since));
  return db
    .select()
    .from(signals)
    .where(and(...conditions))
    .orderBy(desc(signals.publishedAt), desc(signals.id))
    .limit(limit);
}

/** The pains behind a pain count or vertical share, newest first, with the link to their post. */
export async function getFilteredPains(db: Database, filter: ActivityFilter, now = new Date(), limit = ACTIVITY_LIST_LIMIT) {
  const conditions = sourceConditions(filter);
  if (filter.vertical) conditions.push(eq(pains.vertical, filter.vertical));
  if (filter.days) conditions.push(gte(pains.createdAt, mixWindowStart(now, filter.days)));
  return db
    .select({
      ...getTableColumns(pains),
      url: signals.url,
      source: signals.source,
      sourceMetadata: signals.metadata,
      author: signals.author,
    })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(and(...conditions))
    .orderBy(desc(pains.createdAt), desc(pains.id))
    .limit(limit);
}
