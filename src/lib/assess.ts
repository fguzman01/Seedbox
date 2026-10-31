import { asc, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { OpportunityAssessor } from "./assessment";
import type { Database } from "./db/client";
import { opportunities, pains } from "./db/schema";

/** How many pains are shown to the assessor as evidence. */
const EVIDENCE_SAMPLE = 10;

export interface AssessRunResult {
  assessed: number;
  failed: number;
}

export interface AssessOptions {
  limit?: number;
  /** Assessments older than this are refreshed; markets change. */
  maxAgeDays?: number;
  onError?: (opportunityId: number, error: unknown) => void;
}

/**
 * Assesses competition and buildability (ADR-0005). Never-assessed opportunities go first,
 * then stale ones; within each group, the ones backed by more pains go first.
 */
export async function assessPendingOpportunities(
  db: Database,
  assessor: OpportunityAssessor,
  { limit = 10, maxAgeDays = 30, onError }: AssessOptions = {},
): Promise<AssessRunResult> {
  const staleBefore = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const painCount = count(pains.id);
  const due = await db
    .select({ id: opportunities.id, title: opportunities.title, summary: opportunities.summary })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .where(or(isNull(opportunities.assessedAt), lt(opportunities.assessedAt, staleBefore)))
    .groupBy(opportunities.id)
    .orderBy(sql`${opportunities.assessedAt} asc nulls first`, desc(painCount), asc(opportunities.id))
    .limit(limit);

  const result: AssessRunResult = { assessed: 0, failed: 0 };
  for (const opportunity of due) {
    const evidence = await db
      .select({ description: pains.description, persona: pains.persona, quote: pains.quote })
      .from(pains)
      .where(eq(pains.opportunityId, opportunity.id))
      .orderBy(desc(pains.id))
      .limit(EVIDENCE_SAMPLE);

    try {
      const { assessment } = await assessor.assess({ ...opportunity, pains: evidence });
      await db
        .update(opportunities)
        .set({ ...assessment, assessedAt: sql`now()`, assessmentModel: assessor.model })
        .where(eq(opportunities.id, opportunity.id));
      result.assessed++;
    } catch (error) {
      result.failed++;
      onError?.(opportunity.id, error);
    }
  }
  return result;
}
