import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { assessPendingOpportunities } from "./assess";
import type { AssessmentInput, OpportunityAssessor } from "./assessment";
import { opportunities, pains, signals } from "./db/schema";
import { getOpportunities, getOpportunity } from "./queries";
import { DEFAULT_WEIGHTS } from "./scoring";
import { testDatabaseUrl, useTestDb } from "./test-db";

function fakeAssessor(fail: string[] = []) {
  const calls: AssessmentInput[] = [];
  const assessor: OpportunityAssessor = {
    model: "fake-model",
    assess: vi.fn(async (input: AssessmentInput) => {
      calls.push(input);
      if (fail.includes(input.title)) throw new Error("API down");
      return {
        assessment: {
          competitionScore: 8,
          competitionRationale: "Poca competencia.",
          competitors: [{ name: "X", url: "https://x.com", note: "Caro." }],
          buildabilityScore: 9,
          buildabilityRationale: "Simple.",
        },
      };
    }),
  };
  return { assessor, calls };
}

describe.skipIf(!testDatabaseUrl)("assessPendingOpportunities (database)", () => {
  const db = useTestDb();

  /** Creates an opportunity with `count` pains, each from a different author. */
  async function seedOpportunity(title: string, count: number, overrides: Partial<typeof opportunities.$inferInsert> = {}) {
    const [opportunity] = await db
      .insert(opportunities)
      .values({ title, summary: `Resumen ${title}`, model: "m", ...overrides })
      .returning();
    for (let i = 0; i < count; i++) {
      const [signal] = await db
        .insert(signals)
        .values({
          source: "test",
          externalId: `${title}-${i}`,
          url: `https://example.com/${title}/${i}`,
          title: null,
          body: "b",
          author: `${title}-author-${i}`,
          publishedAt: new Date(),
        })
        .returning();
      await db.insert(pains).values({
        signalId: signal.id,
        opportunityId: opportunity.id,
        description: `${title} dolor ${i}`,
        persona: "p",
        quote: `quote ${i}`,
        vertical: "smb",
        intensity: "high",
        willingnessToPay: "explicit",
        model: "m",
      });
    }
    return opportunity;
  }

  it("assesses unassessed opportunities with their evidence and stores the result", async () => {
    const opportunity = await seedOpportunity("facturas", 2);
    const { assessor, calls } = fakeAssessor();

    const result = await assessPendingOpportunities(db, assessor);

    expect(result).toEqual({ assessed: 1, failed: 0 });
    expect(calls[0]).toMatchObject({ title: "facturas", summary: "Resumen facturas" });
    expect(calls[0].pains.map((p) => p.quote).sort()).toEqual(["quote 0", "quote 1"]);

    const [stored] = await db.select().from(opportunities).where(eq(opportunities.id, opportunity.id));
    expect(stored).toMatchObject({
      competitionScore: 8,
      buildabilityScore: 9,
      competitors: [{ name: "X", url: "https://x.com", note: "Caro." }],
      assessmentModel: "fake-model",
    });
    expect(stored.assessedAt).toBeInstanceOf(Date);

    const detail = await getOpportunity(opportunity.id, DEFAULT_WEIGHTS, db);
    expect(detail?.axes.competition).toBe(8);
    expect(detail?.score.partial).toBe(false);
  });

  it("skips fresh assessments, refreshes stale ones and prioritizes by evidence", async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await seedOpportunity("fresca", 1, { assessedAt: new Date(), competitionScore: 5, buildabilityScore: 5 });
    await seedOpportunity("vieja", 1, { assessedAt: old, competitionScore: 5, buildabilityScore: 5 });
    await seedOpportunity("chica", 1);
    await seedOpportunity("grande", 3);
    const { assessor, calls } = fakeAssessor();

    await assessPendingOpportunities(db, assessor);

    expect(calls.map((c) => c.title)).toEqual(["grande", "chica", "vieja"]);
  });

  it("respects the limit and keeps failures unassessed", async () => {
    await seedOpportunity("a", 2);
    await seedOpportunity("b", 1);
    await seedOpportunity("c", 1);
    const onError = vi.fn();

    const result = await assessPendingOpportunities(db, fakeAssessor(["a"]).assessor, { limit: 2, onError });

    expect(result).toEqual({ assessed: 1, failed: 1 });
    expect(onError).toHaveBeenCalledWith(expect.any(Number), expect.any(Error));
    const rows = await db.select().from(opportunities).orderBy(opportunities.id);
    expect(rows.map((r) => r.assessedAt !== null)).toEqual([false, true, false]);
  });

  it("orders the opportunity list by total score for the given weights", async () => {
    // "popular": 3 authors, no market assessment. "pagada": 1 author, assessed as wide open.
    await seedOpportunity("popular", 3);
    await seedOpportunity("pagada", 1, { assessedAt: new Date(), competitionScore: 10, buildabilityScore: 10 });

    const byDefault = await getOpportunities(DEFAULT_WEIGHTS, db);
    const marketFirst = await getOpportunities(
      { frequency: 5, intensity: 5, willingness: 5, competition: 50, buildability: 50 },
      db,
    );

    expect(byDefault.map((o) => o.title)).toEqual(["popular", "pagada"]);
    expect(byDefault[0].score.partial).toBe(true);
    expect(marketFirst.map((o) => o.title)).toEqual(["pagada", "popular"]);
  });
});
