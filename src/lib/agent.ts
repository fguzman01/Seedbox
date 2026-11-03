import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDueOpportunities, saveAssessment } from "./assess";
import { ASSESSMENT_RULES, assessmentSchema, normalizeAssessment } from "./assessment";
import { applyClustering, getCatalog, getUnclusteredPains } from "./cluster";
import { CLUSTERING_RULES, clusteringSchema, resolveClustering } from "./clustering";
import type { Database } from "./db/client";
import { opportunities, pains, signals } from "./db/schema";
import { EXTRACTION_RULES, keepVerifiedPains } from "./extraction";
import { extractedPainSchema } from "./pains";
import { getPendingSignals, saveExtraction } from "./process";
import { DOMAINS } from "./sources/types";

/**
 * Work exchange with the Claude Code analyst (H9, ADR-0008): the site hands out pending work
 * and validates the results with the same code as the Claude API pipeline.
 */

export const DEFAULT_AGENT_MODEL = "claude-code";

export const WORK_KINDS = ["extract", "cluster", "assess"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/** Default and maximum batch sizes, small enough to fit comfortably in one agent session. */
export const WORK_LIMITS: Record<WorkKind, { default: number; max: number }> = {
  extract: { default: 30, max: 100 },
  cluster: { default: 20, max: 50 },
  assess: { default: 5, max: 20 },
};

export function clampLimit(kind: WorkKind, requested: unknown): number {
  const n = Number(requested);
  if (!Number.isInteger(n) || n <= 0) return WORK_LIMITS[kind].default;
  return Math.min(n, WORK_LIMITS[kind].max);
}

export async function getAgentStatus(db: Database) {
  const [[pending], [unclustered], due] = await Promise.all([
    db.select({ n: count() }).from(signals).where(eq(signals.status, "pending")),
    db.select({ n: count() }).from(pains).where(isNull(pains.opportunityId)),
    getDueOpportunities(db, WORK_LIMITS.assess.max),
  ]);
  return {
    extract: pending.n,
    cluster: unclustered.n,
    /** Capped at the assess maximum; enough to know whether there is work. */
    assess: due.length,
  };
}

export async function getExtractWork(db: Database, limit: number) {
  const items = await getPendingSignals(db, limit);
  return {
    kind: "extract" as const,
    rules: EXTRACTION_RULES,
    items: items.map((s) => ({ id: s.id, source: s.source, url: s.url, title: s.title, body: s.body })),
  };
}

export async function getClusterWork(db: Database, limit: number) {
  for (const domain of DOMAINS) {
    const batch = await getUnclusteredPains(db, domain, limit);
    if (batch.length) {
      return { kind: "cluster" as const, domain, rules: CLUSTERING_RULES, catalog: await getCatalog(db, domain), pains: batch };
    }
  }
  return { kind: "cluster" as const, domain: DOMAINS[0], rules: CLUSTERING_RULES, catalog: [], pains: [] };
}

export async function getAssessWork(db: Database, limit: number) {
  return { kind: "assess" as const, rules: ASSESSMENT_RULES, items: await getDueOpportunities(db, limit) };
}

export function getAgentWork(db: Database, kind: WorkKind, limit: number) {
  if (kind === "extract") return getExtractWork(db, limit);
  if (kind === "cluster") return getClusterWork(db, limit);
  return getAssessWork(db, limit);
}

const modelSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\w.:/-]+$/, "model: letters, digits and . _ : / - only")
  .optional();

export const agentResultsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("extract"),
    model: modelSchema,
    results: z
      .array(z.object({ signalId: z.number().int().positive(), pains: z.array(extractedPainSchema).max(20) }))
      .max(WORK_LIMITS.extract.max),
  }),
  z.object({
    kind: z.literal("cluster"),
    model: modelSchema,
    domain: z.enum(DOMAINS).optional(),
    output: clusteringSchema,
  }),
  z.object({
    kind: z.literal("assess"),
    model: modelSchema,
    results: z
      .array(z.object({ opportunityId: z.number().int().positive(), assessment: assessmentSchema }))
      .max(WORK_LIMITS.assess.max),
  }),
]);

export type AgentResults = z.infer<typeof agentResultsSchema>;

export async function submitAgentResults(db: Database, payload: AgentResults) {
  const model = payload.model ?? DEFAULT_AGENT_MODEL;

  if (payload.kind === "extract") {
    const summary = { kind: payload.kind, processed: 0, discarded: 0, droppedPains: 0, skipped: [] as { signalId: number; reason: string }[] };
    for (const { signalId, pains: extracted } of payload.results) {
      const [signal] = await db.select().from(signals).where(eq(signals.id, signalId));
      if (!signal) {
        summary.skipped.push({ signalId, reason: "unknown signal" });
        continue;
      }
      if (signal.status !== "pending") {
        summary.skipped.push({ signalId, reason: `already ${signal.status}` });
        continue;
      }
      // Same evidence rule as the API pipeline: quotes must be copied from the post.
      const verified = keepVerifiedPains(signal, extracted);
      summary.droppedPains += extracted.length - verified.length;
      summary[await saveExtraction(db, signalId, verified, model)]++;
    }
    return summary;
  }

  if (payload.kind === "cluster") {
    const domain = payload.domain ?? DOMAINS[0];
    const ids = [...new Set(payload.output.assignments.map((a) => a.pain_id))];
    // Only pains that are still unclustered in this domain take part; others are ignored.
    const batch = ids.length
      ? await db
          .select({
            id: pains.id,
            description: pains.description,
            persona: pains.persona,
            quote: pains.quote,
            vertical: pains.vertical,
          })
          .from(pains)
          .innerJoin(signals, eq(pains.signalId, signals.id))
          .where(and(inArray(pains.id, ids), isNull(pains.opportunityId), eq(signals.domain, domain)))
      : [];
    const resolved = resolveClustering({ opportunities: await getCatalog(db, domain), pains: batch }, payload.output);
    await applyClustering(db, domain, resolved, model);
    const eligible = new Set(batch.map((p) => p.id));
    return {
      kind: payload.kind,
      assigned: resolved.assign.size,
      created: resolved.create.length,
      invalid: resolved.unassigned,
      ignored: ids.filter((id) => !eligible.has(id)),
    };
  }

  const summary = { kind: payload.kind, assessed: 0, skipped: [] as { opportunityId: number; reason: string }[] };
  for (const { opportunityId, assessment } of payload.results) {
    const exists = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!exists.length) {
      summary.skipped.push({ opportunityId, reason: "unknown opportunity" });
      continue;
    }
    await saveAssessment(db, opportunityId, normalizeAssessment(assessment), model);
    summary.assessed++;
  }
  return summary;
}
