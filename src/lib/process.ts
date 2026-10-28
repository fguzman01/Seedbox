import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { pains, signals, type Signal } from "./db/schema";
import type { PainExtractor } from "./extraction";

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
  const pending = await db
    .select()
    .from(signals)
    .where(eq(signals.status, "pending"))
    .orderBy(asc(signals.publishedAt))
    .limit(limit);

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

      const status = extracted.length > 0 ? "processed" : "discarded";
      await db.transaction(async (tx) => {
        if (extracted.length > 0) {
          await tx.insert(pains).values(
            extracted.map((p) => ({
              signalId: signal.id,
              description: p.description,
              persona: p.persona,
              quote: p.quote,
              vertical: p.vertical,
              intensity: p.intensity,
              willingnessToPay: p.willingness_to_pay,
              model: extractor.model,
            })),
          );
        }
        await tx
          .update(signals)
          .set({ status, processedAt: sql`now()` })
          .where(eq(signals.id, signal.id));
      });
      result[status]++;
      result.pains += extracted.length;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return result;
}
