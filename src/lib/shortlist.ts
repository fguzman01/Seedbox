import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Database } from "./db/client";
import { opportunities, pains, signals } from "./db/schema";
import { isWeakEvidence } from "./evidence";
import { scoringEvidence } from "./queries";
import { axisScores, DEFAULT_WEIGHTS, totalScore, type AxisScores, type EvidenceCounts } from "./scoring";

/**
 * Short list for the weekly viability evaluator (H19, ADR-0013): the best opportunities that are
 * already assessed (competition and buildability) and whose evidence is not weak (H12). Read-only.
 * Whether an opportunity was already written up is resolved on GitHub by the skill, not here.
 */

/** The weekly run writes between 3 and 5 write-ups, so the list is never longer than 5. */
export const SHORTLIST_MAX = 5;

/** How many pains (with their quote and source link) accompany each opportunity. */
const SHORTLIST_PAINS = 10;

export interface ShortlistCandidate extends EvidenceCounts {
  id: number;
  competitionScore: number | null;
  buildabilityScore: number | null;
}

/** Eligible candidates, best first: total score, then distinct authors, then the lower id. */
/** `exclude` holds the ids already written up (or discarded), so each week reaches new opportunities. */
export function rankShortlist<T extends ShortlistCandidate>(candidates: T[], limit = SHORTLIST_MAX, exclude: number[] = []) {
  const size = Math.min(SHORTLIST_MAX, Math.max(0, Math.floor(limit)));
  return candidates
    .filter((c) => !exclude.includes(c.id))
    .filter((c) => c.competitionScore !== null && c.buildabilityScore !== null && !isWeakEvidence(c.authorCount))
    .map((c) => {
      const axes = axisScores(c, c);
      return { ...c, axes, total: totalScore(axes, DEFAULT_WEIGHTS).total };
    })
    .sort((a, b) => b.total - a.total || b.authorCount - a.authorCount || a.id - b.id)
    .slice(0, size);
}

export interface ShortlistItem {
  id: number;
  title: string;
  summary: string;
  totalScore: number;
  axes: AxisScores;
  authorCount: number;
  assessment: {
    competitionScore: number | null;
    competitionRationale: string | null;
    competitors: { name: string; url: string; note: string }[];
    buildabilityScore: number | null;
    buildabilityRationale: string | null;
    assessedAt: Date | null;
  };
  pains: { description: string; persona: string; quote: string; source: string; url: string; author: string | null }[];
}

export async function getShortlist(db: Database, limit = SHORTLIST_MAX, exclude: number[] = []): Promise<ShortlistItem[]> {
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      summary: opportunities.summary,
      competitionScore: opportunities.competitionScore,
      competitionRationale: opportunities.competitionRationale,
      competitors: opportunities.competitors,
      buildabilityScore: opportunities.buildabilityScore,
      buildabilityRationale: opportunities.buildabilityRationale,
      assessedAt: opportunities.assessedAt,
      ...scoringEvidence,
    })
    .from(opportunities)
    .innerJoin(pains, eq(pains.opportunityId, opportunities.id))
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .where(and(isNotNull(opportunities.competitionScore), isNotNull(opportunities.buildabilityScore)))
    .groupBy(opportunities.id);

  return Promise.all(
    rankShortlist(rows, limit, exclude).map(async (row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      totalScore: row.total,
      axes: row.axes,
      authorCount: row.authorCount,
      assessment: {
        competitionScore: row.competitionScore,
        competitionRationale: row.competitionRationale,
        competitors: row.competitors ?? [],
        buildabilityScore: row.buildabilityScore,
        buildabilityRationale: row.buildabilityRationale,
        assessedAt: row.assessedAt,
      },
      pains: await db
        .select({
          description: pains.description,
          persona: pains.persona,
          quote: pains.quote,
          source: signals.source,
          url: signals.url,
          author: signals.author,
        })
        .from(pains)
        .innerJoin(signals, eq(pains.signalId, signals.id))
        .where(eq(pains.opportunityId, row.id))
        .orderBy(desc(pains.id))
        .limit(SHORTLIST_PAINS),
    })),
  );
}
