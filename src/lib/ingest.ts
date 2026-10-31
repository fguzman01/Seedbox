import { eq, max } from "drizzle-orm";
import type { Database } from "./db/client";
import { signals } from "./db/schema";
import type { SourceAdapter } from "./sources/types";

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
