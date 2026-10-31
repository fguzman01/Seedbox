import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { pains, signals, type Signal } from "./db/schema";
import type { PainExtractor } from "./extraction";
import type { ExtractedPain } from "./pains";

/** Oldest pending signals first. Shared by the API pipeline and the Claude Code analyst (H9). */
export async function getPendingSignals(db: Database, limit: number) {
  return db
    .select()
    .from(signals)
    .where(eq(signals.status, "pending"))
    .orderBy(asc(signals.publishedAt))
    .limit(limit);
}

/**
 * Stores the pains extracted from a signal and marks it "processed", or "discarded" when it has
 * none. Pains must already be verified against the post (see keepVerifiedPains).
 */
export async function saveExtraction(
  db: Database,
  signalId: number,
  extracted: ExtractedPain[],
  model: string,
): Promise<"processed" | "discarded"> {
  const status = extracted.length > 0 ? "processed" : "discarded";
  await db.transaction(async (tx) => {
    if (extracted.length > 0) {
      await tx.insert(pains).values(
        extracted.map((p) => ({
          signalId,
          description: p.description,
          persona: p.persona,
          quote: p.quote,
          vertical: p.vertical,
          intensity: p.intensity,
          willingnessToPay: p.willingness_to_pay,
          model,
        })),
      );
    }
    await tx.update(signals).set({ status, processedAt: sql`now()` }).where(eq(signals.id, signalId));
  });
  return status;
}

export interface ProcessResult {
  processed: number;
  discarded: number;
  failed: number;
  pains: number;
}

export interface ProcessOptions {
  limit?: number;
  concurrency?: number;
  onError?: (signal: Signal, error: unknown) => void;
}

/**
 * Runs pain extraction over pending signals. Signals with pains become "processed", signals
 * without any become "discarded"; both are never reprocessed. Signals whose extraction fails
 * stay "pending" so the next run retries them.
 */
export async function processPendingSignals(
  db: Database,
  extractor: PainExtractor,
  { limit = 50, concurrency = 4, onError }: ProcessOptions = {},
): Promise<ProcessResult> {
  const pending = await getPendingSignals(db, limit);

  const result: ProcessResult = { processed: 0, discarded: 0, failed: 0, pains: 0 };
  const queue = [...pending];

  async function worker() {
    for (let signal = queue.shift(); signal; signal = queue.shift()) {
      let extracted;
      try {
        extracted = (await extractor.extract(signal)).pains;
      } catch (error) {
        result.failed++;
        onError?.(signal, error);
        continue;
      }

      const status = await saveExtraction(db, signal.id, extracted, extractor.model);
      result[status]++;
      result.pains += extracted.length;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return result;
}
