import { eq, max } from "drizzle-orm";
import type { Database } from "./db/client";
import { ingestRuns, signals, type IngestRunStatus } from "./db/schema";
import { getSource } from "./sources";
import { SourceNotConfiguredError, type SourceAdapter } from "./sources/types";

export interface IngestResult {
  source: string;
  fetched: number;
  inserted: number;
}

/**
 * Fetches new items from a source and stores them. Only items newer than the latest one
 * already stored are requested, and (source, externalId) duplicates are ignored, so the
 * job is safe to re-run.
 */
export async function ingest(db: Database, adapter: SourceAdapter): Promise<IngestResult> {
  const [{ latest }] = await db
    .select({ latest: max(signals.publishedAt) })
    .from(signals)
    .where(eq(signals.source, adapter.id));

  const fetched = await adapter.fetchSignals({ since: latest ?? undefined });
  if (fetched.length === 0) {
    return { source: adapter.id, fetched: 0, inserted: 0 };
  }

  const inserted = await db
    .insert(signals)
    .values(fetched.map((s) => ({ ...s, source: adapter.id, domain: adapter.domain })))
    .onConflictDoNothing({ target: [signals.source, signals.externalId] })
    .returning({ id: signals.id });

  return { source: adapter.id, fetched: fetched.length, inserted: inserted.length };
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
    outcome = { source: sourceId, fetched: 0, inserted: 0, status, error };
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
