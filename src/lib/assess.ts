import { asc, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Assessment, OpportunityAssessor } from "./assessment";
import type { Database } from "./db/client";
import { opportunities, pains } from "./db/schema";

/** How many pains are shown to the assessor as evidence. */
const EVIDENCE_SAMPLE = 10;

/**
 * Opportunities due for a market assessment, with a sample of their evidence. Never-assessed
 * ones go first, then stale ones; within each group, the ones backed by more pains go first.
 * Shared with the Claude Code analyst (H9).
 */
export async function getDueOpportunities(db: Database, limit: number, maxAgeDays = 30) {
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

  return Promise.all(
    due.map(async (opportunity) => ({
      ...opportunity,
      pains: await db
        .select({ description: pains.description, persona: pains.persona, quote: pains.quote })
        .from(pains)
        .where(eq(pains.opportunityId, opportunity.id))
        .orderBy(desc(pains.id))
        .limit(EVIDENCE_SAMPLE),
    })),
  );
}

/** Stores a normalized assessment (see normalizeAssessment). Returns false if the opportunity is gone. */
export async function saveAssessment(
  db: Database,
  opportunityId: number,
  assessment: Assessment,
  model: string,
): Promise<boolean> {
  const updated = await db
    .update(opportunities)
    .set({ ...assessment, assessedAt: sql`now()`, assessmentModel: model })
    .where(eq(opportunities.id, opportunityId))
    .returning({ id: opportunities.id });
  return updated.length > 0;
}

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

/** Assesses competition and buildability with the Claude API (ADR-0005). */
export async function assessPendingOpportunities(
  db: Database,
  assessor: OpportunityAssessor,
  { limit = 10, maxAgeDays = 30, onError }: AssessOptions = {},
): Promise<AssessRunResult> {
  const due = await getDueOpportunities(db, limit, maxAgeDays);

  const result: AssessRunResult = { assessed: 0, failed: 0 };
  for (const opportunity of due) {
    try {
      const { assessment } = await assessor.assess(opportunity);
      await saveAssessment(db, opportunity.id, assessment, assessor.model);
      result.assessed++;
    } catch (error) {
      result.failed++;
      onError?.(opportunity.id, error);
    }
  }
  return result;
}
