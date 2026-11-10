import { describe, expect, it } from "vitest";
import { opportunities, pains, signals } from "./db/schema";
import { getShortlist, rankShortlist, SHORTLIST_MAX, type ShortlistCandidate } from "./shortlist";
import { testDatabaseUrl, useTestDb } from "./test-db";

const candidate = (id: number, overrides: Partial<ShortlistCandidate> = {}): ShortlistCandidate => ({
  id,
  competitionScore: 7,
  buildabilityScore: 7,
  authorCount: 3,
  intensityLow: 0,
  intensityMedium: 0,
  intensityHigh: 3,
  willingnessNone: 0,
  willingnessImplied: 0,
  willingnessExplicit: 3,
  ...overrides,
});

describe("rankShortlist", () => {
  it("drops unassessed opportunities and weak evidence (one author)", () => {
    const ranked = rankShortlist([
      candidate(1),
      candidate(2, { competitionScore: null }),
      candidate(3, { buildabilityScore: null }),
      candidate(4, { authorCount: 1 }),
      candidate(5, { authorCount: 0 }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual([1]);
  });

  it("orders by total score, then distinct authors, then id", () => {
    const ranked = rankShortlist([
      candidate(1, { competitionScore: 3 }),
      candidate(2, { authorCount: 2 }),
      candidate(3, { authorCount: 6 }),
      candidate(4, { authorCount: 6 }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual([3, 4, 2, 1]);
  });

  it("leaves out the excluded ids so the second week reaches new opportunities", () => {
    const all = Array.from({ length: 8 }, (_, i) => candidate(i + 1, { competitionScore: 9 - i }));
    const week1 = rankShortlist(all).map((c) => c.id);
    expect(week1).toEqual([1, 2, 3, 4, 5]);
    expect(rankShortlist(all, 5, week1).map((c) => c.id)).toEqual([6, 7, 8]);
  });

  it("never returns more than 5, nor a negative size", () => {
    const many = Array.from({ length: 9 }, (_, i) => candidate(i + 1));
    expect(rankShortlist(many, 20)).toHaveLength(SHORTLIST_MAX);
    expect(rankShortlist(many, 3)).toHaveLength(3);
    expect(rankShortlist(many, -1)).toHaveLength(0);
  });
});

describe.skipIf(!testDatabaseUrl)("getShortlist (database)", () => {
  const db = useTestDb();

  async function seed(title: string, authors: number, market: { competition: number | null; buildability: number | null }) {
    const [opportunity] = await db
      .insert(opportunities)
      .values({
        title,
        summary: `Resumen ${title}`,
        model: "m",
        competitionScore: market.competition,
        buildabilityScore: market.buildability,
        competitors: market.competition === null ? null : [{ name: "Rival", url: "https://rival.example", note: "US$20/mes" }],
        assessedAt: market.competition === null ? null : new Date(),
      })
      .returning();
    for (let i = 0; i < authors; i++) {
      const [signal] = await db
        .insert(signals)
        .values({
          source: "test",
          externalId: `${title}-${i}`,
          url: `https://example.com/${title}/${i}`,
          body: "b",
          author: `${title}-author-${i}`,
          publishedAt: new Date(),
        })
        .returning();
      await db.insert(pains).values({
        signalId: signal.id,
        opportunityId: opportunity.id,
        description: `${title} dolor ${i}`,
        persona: "freelancers",
        quote: `cita ${i}`,
        vertical: "freelance",
        intensity: "high",
        willingnessToPay: "explicit",
        model: "m",
      });
    }
    return opportunity;
  }

  it("returns only assessed opportunities with non-weak evidence, each pain with quote and source link", async () => {
    const good = await seed("buena", 3, { competition: 8, buildability: 8 });
    await seed("sin-evaluar", 4, { competition: null, buildability: null });
    await seed("debil", 1, { competition: 9, buildability: 9 });
    const second = await seed("segunda", 2, { competition: 5, buildability: 5 });

    const list = await getShortlist(db);

    expect(list.map((o) => o.id)).toEqual([good.id, second.id]);
    expect(list[0].assessment.competitors).toEqual([{ name: "Rival", url: "https://rival.example", note: "US$20/mes" }]);
    expect(list[0].pains).toHaveLength(3);
    for (const pain of list[0].pains) {
      expect(pain.quote).toMatch(/^cita/);
      expect(pain.url).toMatch(/^https:\/\/example\.com\/buena\//);
    }
  });

  it("skips excluded ids", async () => {
    const a = await seed("a", 2, { competition: 9, buildability: 9 });
    const b = await seed("b", 2, { competition: 5, buildability: 5 });
    expect((await getShortlist(db, 5, [a.id])).map((o) => o.id)).toEqual([b.id]);
  });

  it("is empty when nothing qualifies and respects the limit", async () => {
    expect(await getShortlist(db)).toEqual([]);
    for (let i = 0; i < 4; i++) await seed(`o${i}`, 2, { competition: 6, buildability: 6 });
    expect(await getShortlist(db, 2)).toHaveLength(2);
  });
});
