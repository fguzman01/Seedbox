import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { PainClusterer } from "./clustering";
import { resolveClustering } from "./clustering";
import type { Database } from "./db/client";
import { opportunities, pains, signals } from "./db/schema";
import { DOMAINS } from "./sources/types";

export interface ClusterRunResult {
  batches: number;
  assigned: number;
  created: number;
  /** Pains the model skipped or assigned to an invalid reference; retried next run. */
  unassigned: number;
  /** Pains in batches whose API call failed; retried next run. */
  failed: number;
}

export interface ClusterOptions {
  batchSize?: number;
  maxBatches?: number;
  onError?: (painIds: number[], error: unknown) => void;
}

/**
 * Assigns unclustered pains to opportunities, one batch at a time, per domain (ADR-0004).
 * Pains that could not be assigned stay unclustered and are not retried within the same run.
 */
export async function clusterPendingPains(
  db: Database,
  clusterer: PainClusterer,
  { batchSize = 20, maxBatches = 10, onError }: ClusterOptions = {},
): Promise<ClusterRunResult> {
  const result: ClusterRunResult = { batches: 0, assigned: 0, created: 0, unassigned: 0, failed: 0 };
  const skip: number[] = [];

  for (const domain of DOMAINS) {
    while (result.batches < maxBatches) {
      const batch = await db
        .select({
          id: pains.id,
          description: pains.description,
          persona: pains.persona,
          quote: pains.quote,
          vertical: pains.vertical,
        })
        .from(pains)
        .innerJoin(signals, eq(pains.signalId, signals.id))
        .where(
          and(
            isNull(pains.opportunityId),
            eq(signals.domain, domain),
            skip.length ? notInArray(pains.id, skip) : undefined,
          ),
        )
        .orderBy(asc(pains.id))
        .limit(batchSize);
      if (batch.length === 0) break;
      result.batches++;

      const catalog = await db
        .select({ id: opportunities.id, title: opportunities.title, summary: opportunities.summary })
        .from(opportunities)
        .where(eq(opportunities.domain, domain))
        .orderBy(asc(opportunities.id));
      const input = { opportunities: catalog, pains: batch };

      let resolved;
      try {
        resolved = resolveClustering(input, (await clusterer.cluster(input)).output);
      } catch (error) {
        const ids = batch.map((p) => p.id);
        skip.push(...ids);
        result.failed += ids.length;
        onError?.(ids, error);
        continue;
      }

      await db.transaction(async (tx) => {
        const created = resolved.create.length
          ? await tx
              .insert(opportunities)
              .values(
                resolved.create.map((o) => ({
                  domain,
                  title: o.title,
                  summary: o.summary,
                  model: clusterer.model,
                })),
              )
              .returning({ id: opportunities.id })
          : [];
        const newIds = new Map(resolved.create.map((o, i) => [o.ref, created[i].id]));

        const touched = new Set<number>();
        for (const [painId, target] of resolved.assign) {
          const opportunityId = typeof target === "number" ? target : newIds.get(target)!;
          touched.add(opportunityId);
          await tx.update(pains).set({ opportunityId }).where(eq(pains.id, painId));
        }
        if (touched.size) {
          await tx
            .update(opportunities)
            .set({ updatedAt: sql`now()` })
            .where(inArray(opportunities.id, [...touched]));
        }
      });

      skip.push(...resolved.unassigned);
      result.assigned += resolved.assign.size;
      result.created += resolved.create.length;
      result.unassigned += resolved.unassigned.length;
    }
  }

  return result;
}
