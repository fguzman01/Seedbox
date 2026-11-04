import { desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Assessment, OpportunityAssessor } from "./assessment";
import type { Database } from "./db/client";
import { opportunities, pains, signals } from "./db/schema";
import { scoringEvidence } from "./queries";
import { axisScores, DEFAULT_WEIGHTS, totalScore } from "./scoring";
import { maxPendingDays } from "./settings";
import { orderDueOpportunities } from "./work-order";

/** How many pains are shown to the assessor as evidence. */
const EVIDENCE_SAMPLE = 10;

export interface DueOptions {
  now?: Date;
  /** Never-assessed opportunities created longer ago than this go first (ADR-0009). */
  maxPendingDays?: number;
}

/**
 * Opportunities due for a market assessment, with a sample of their evidence, in the order of
 * orderDueOpportunities (H11): never-assessed ones waiting more than N days first, then the other
 * never-assessed ones by distinct authors and partial score (default weights, no market axes),
 * then stale ones. Shared with the Claude Code analyst (H9).
 */
export async function getDueOpportunities(
  db: Database,
  limit: number,
  maxAgeDays = 30,
  { now = new Date(), maxPendingDays: days = maxPendingDays() }: DueOptions = {},
) {
  const staleBefore = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      summary: opportunities.summary,
      createdAt: opportunities.createdAt,
      assessedAt: opportunities.assessedAt,
      ...scoringEvidence,
    })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(or(isNull(opportunities.assessedAt), lt(opportunities.assessedAt, staleBefore)))
    .groupBy(opportunities.id);

  const ranked = candidates.map((row) => ({
    ...row,
    partialScore: totalScore(axisScores(row, { competitionScore: null, buildabilityScore: null }), DEFAULT_WEIGHTS).total,
  }));
  const due = orderDueOpportunities(ranked, { now, maxPendingDays: days })
    .slice(0, Math.max(0, limit))
    .map(({ id, title, summary }) => ({ id, title, summary }));

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
