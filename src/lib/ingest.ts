import { and, eq, gte, inArray, max, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { ingestRuns, signals, type IngestRunStatus } from "./db/schema";
import { getSource } from "./sources";
import { feedOf, SourceNotConfiguredError, type FeedFetchReport, type SourceAdapter } from "./sources/types";

/** Per-feed counts of a run (sources with several feeds, e.g. Stack Exchange sites). */
export interface FeedReport extends FeedFetchReport {
  inserted: number;
}

/** What the deletion check did (ADR-0010): only counts, nothing about the deleted items. */
export interface ReconcileReport {
  checked: number;
  /** Missing for the first time: marked with `metadata.missingSince`. */
  missing: number;
  /** Missing in two checks in a row: deleted with their pains. */
  deleted: number;
}

export interface IngestResult {
  source: string;
  fetched: number;
  inserted: number;
  /** Present when the adapter reports per-feed counts. */
  feeds?: FeedReport[];
  /** Present when the adapter checks for deleted items. */
  reconcile?: ReconcileReport;
}

/** The new items were stored but a later step of the run (the deletion check) failed. */
export class PartialIngestError extends Error {
  constructor(
    message: string,
    readonly result: IngestResult,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fetches new items from a source and stores them. Only items newer than the latest one
 * already stored are requested, and (source, externalId) duplicates are ignored, so the
 * job is safe to re-run. Sources that support it then check their recent items for deletions.
 */
export async function ingest(db: Database, adapter: SourceAdapter, { now = new Date() } = {}): Promise<IngestResult> {
  const [{ latest }] = await db
    .select({ latest: max(signals.publishedAt) })
    .from(signals)
    .where(eq(signals.source, adapter.id));

  const feedReports: FeedFetchReport[] = [];
  const fetched = await adapter.fetchSignals({
    since: latest ?? undefined,
    onFeed: (report) => feedReports.push(report),
  });

  const inserted =
    fetched.length === 0
      ? []
      : await db
          .insert(signals)
          .values(fetched.map((s) => ({ ...s, source: adapter.id, domain: adapter.domain })))
          .onConflictDoNothing({ target: [signals.source, signals.externalId] })
          .returning({ id: signals.id, metadata: signals.metadata });

  const result: IngestResult = { source: adapter.id, fetched: fetched.length, inserted: inserted.length };
  if (feedReports.length > 0) {
    const insertedByFeed = new Map<string, number>();
    for (const row of inserted) {
      const feed = feedOf(row.metadata);
      if (feed) insertedByFeed.set(feed, (insertedByFeed.get(feed) ?? 0) + 1);
    }
    result.feeds = feedReports.map((r) => ({ ...r, inserted: insertedByFeed.get(r.feed) ?? 0 }));
  }

  if (adapter.reconcile) {
    try {
      result.reconcile = await reconcileStored(db, adapter, now);
    } catch (error) {
      throw new PartialIngestError(`deletion check failed: ${errorMessage(error)}`, result, { cause: error });
    }
  }
  return result;
}

export interface StoredForCheck {
  id: number;
  externalId: string;
  metadata: Record<string, unknown>;
}

/**
 * Decides what to do with each checked item: one absence marks it, a second absence in a row
 * deletes it, and an item that is back loses its mark (so a passing API failure never deletes).
 */
export function planReconcile(stored: StoredForCheck[], missing: Iterable<string>) {
  const missingIds = new Set(missing);
  const plan = { mark: [] as number[], remove: [] as number[], clear: [] as number[] };
  for (const item of stored) {
    const marked = item.metadata.missingSince != null;
    if (missingIds.has(item.externalId)) (marked ? plan.remove : plan.mark).push(item.id);
    else if (marked) plan.clear.push(item.id);
  }
  return plan;
}

/** Looks up again the items stored in the last `reconcileDays` and applies `planReconcile`. */
export async function reconcileStored(db: Database, adapter: SourceAdapter, now = new Date()): Promise<ReconcileReport> {
  if (!adapter.reconcile) return { checked: 0, missing: 0, deleted: 0 };
  const since = new Date(now.getTime() - (adapter.reconcileDays ?? 30) * DAY_MS);
  const stored = await db
    .select({ id: signals.id, externalId: signals.externalId, metadata: signals.metadata })
    .from(signals)
    .where(and(eq(signals.source, adapter.id), gte(signals.fetchedAt, since)));
  if (stored.length === 0) return { checked: 0, missing: 0, deleted: 0 };

  const { missing } = await adapter.reconcile(stored.map(({ externalId }) => ({ externalId })));
  const plan = planReconcile(stored, missing);
  await db.transaction(async (tx) => {
    // Pains go with their signal (onDelete: cascade); nothing about the deleted item is kept.
    if (plan.remove.length) await tx.delete(signals).where(inArray(signals.id, plan.remove));
    if (plan.mark.length) {
      await tx
        .update(signals)
        .set({ metadata: sql`${signals.metadata} || ${JSON.stringify({ missingSince: now.toISOString() })}::jsonb` })
        .where(inArray(signals.id, plan.mark));
    }
    if (plan.clear.length) {
      await tx
        .update(signals)
        .set({ metadata: sql`${signals.metadata} - 'missingSince'` })
        .where(inArray(signals.id, plan.clear));
    }
  });
  return { checked: stored.length, missing: plan.mark.length, deleted: plan.remove.length };
}

/** Log lines of a successful run, without the "[source]" prefix. */
export function describeIngest(result: IngestResult): string[] {
  const lines = (result.feeds ?? []).map(
    (f) => `${f.feed} fetched=${f.fetched} filtered=${f.filtered} capped=${f.capped} inserted=${f.inserted}`,
  );
  lines.push(`fetched=${result.fetched} inserted=${result.inserted}`);
  if (result.reconcile) {
    const r = result.reconcile;
    lines.push(`deletion check: checked=${r.checked} missing=${r.missing} deleted=${r.deleted} (deleted on the source)`);
  }
  return lines;
}

export interface IngestRunOutcome extends IngestResult {
  status: IngestRunStatus;
  /** Set when the source was skipped or failed. */
  error?: unknown;
}

/**
 * Ingests one source by id and records the run in `ingest_runs` (H14), so the site can tell a
 * source without configuration ("skipped") from one that simply brought no posts. It never
 * throws for the source itself: a missing configuration or a failing API come back as the
 * outcome's status, and the caller decides how to log them and the exit code.
 */
export async function ingestAndRecord(
  db: Database,
  sourceId: string,
  resolve: (id: string) => SourceAdapter = getSource,
): Promise<IngestRunOutcome> {
  let outcome: IngestRunOutcome;
  try {
    outcome = { ...(await ingest(db, resolve(sourceId))), status: "ok" };
  } catch (error) {
    const status = error instanceof SourceNotConfiguredError ? "skipped" : "error";
    // Items stored before a later step failed still count.
    const partial = error instanceof PartialIngestError ? error.result : { source: sourceId, fetched: 0, inserted: 0 };
    outcome = { ...partial, status, error };
  }
  await db.insert(ingestRuns).values({
    source: outcome.source,
    status: outcome.status,
    fetched: outcome.fetched,
    inserted: outcome.inserted,
    message: outcome.error === undefined ? null : errorMessage(outcome.error).slice(0, 500),
  });
  return outcome;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
