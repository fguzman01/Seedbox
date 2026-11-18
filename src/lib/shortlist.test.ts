import { describe, expect, it } from "vitest";
import { opportunities, pains, signals } from "./db/schema";
import { getShortlist, rankShortlist, SHORTLIST_MAX, type ShortlistCandidate } from "./shortlist";
import { testDatabaseUrl, useTestDb } from "./test-db";

const candidate = (id: number, overrides: Partial<ShortlistCandidate> = {}): ShortlistCandidate => ({
  id,
  mainVertical: "freelance",
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
    expect(ranked.items.map((c) => c.id)).toEqual([1]);
  });

  it("orders by total score, then distinct authors, then id", () => {
    const ranked = rankShortlist([
      candidate(1, { competitionScore: 3 }),
      candidate(2, { authorCount: 2 }),
      candidate(3, { authorCount: 6 }),
      candidate(4, { authorCount: 6 }),
    ]);
    expect(ranked.items.map((c) => c.id)).toEqual([3, 4, 2, 1]);
  });

  it("leaves out the excluded ids so the second week reaches new opportunities", () => {
    const all = Array.from({ length: 8 }, (_, i) => candidate(i + 1, { competitionScore: 9 - i }));
    const week1 = rankShortlist(all).items.map((c) => c.id);
    expect(week1).toEqual([1, 2, 3, 4, 5]);
    expect(rankShortlist(all, 5, week1).items.map((c) => c.id)).toEqual([6, 7, 8]);
  });

  it("never returns more than 5, nor a negative size", () => {
    const many = Array.from({ length: 9 }, (_, i) => candidate(i + 1));
    expect(rankShortlist(many, 20).items).toHaveLength(SHORTLIST_MAX);
    expect(rankShortlist(many, 3).items).toHaveLength(3);
    expect(rankShortlist(many, -1).items).toHaveLength(0);
  });
});

describe("rankShortlist non-tech quota (H27)", () => {
  const dev = (id: number, competitionScore: number) => candidate(id, { mainVertical: "devtools", competitionScore });
  const non = (id: number, competitionScore: number) => candidate(id, { mainVertical: "smb", competitionScore });

  it("reserves 2 of 5 slots for non-devtools even if they score lower", () => {
    const all = [...[1, 2, 3, 4, 5, 6, 7].map((i) => dev(i, 10 - i * 0.1)), non(8, 3), non(9, 2), non(10, 1)];
    const { items, nonTechCount, nonTechShortfall } = rankShortlist(all);
    expect(items).toHaveLength(5);
    expect(items.filter((c) => c.mainVertical !== "devtools").map((c) => c.id)).toEqual([8, 9]);
    expect(nonTechCount).toBe(2);
    expect(nonTechShortfall).toBe(0);
    const totals = items.map((c) => c.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it("does not pad with devtools beyond the quota when non-tech is scarce, and reports the shortfall", () => {
    const all = [...[1, 2, 3, 4, 5, 6].map((i) => dev(i, 9)), non(7, 3)];
    const { items, nonTechCount, nonTechShortfall } = rankShortlist(all);
    expect(items.map((c) => c.id)).toContain(7);
    expect(items).toHaveLength(5);
    expect(nonTechCount).toBe(1);
    expect(nonTechShortfall).toBe(1);
  });

  it("reports the full shortfall when there is no non-tech opportunity at all", () => {
    const { nonTechCount, nonTechShortfall } = rankShortlist([dev(1, 8), dev(2, 7)]);
    expect(nonTechCount).toBe(0);
    expect(nonTechShortfall).toBe(2);
  });

  it("keeps excluded, weak and unassessed non-tech out of the quota", () => {
    const all = [
      dev(1, 9),
      non(2, 8),
      candidate(3, { mainVertical: "smb", authorCount: 1 }),
      candidate(4, { mainVertical: "smb", buildabilityScore: null }),
      non(5, 7),
    ];
    const { items, nonTechShortfall } = rankShortlist(all, 5, [2]);
    expect(items.map((c) => c.id).sort()).toEqual([1, 5]);
    expect(nonTechShortfall).toBe(1);
  });

  it("caps the quota at limit and honours minNonTech 0", () => {
    const all = [dev(1, 9), dev(2, 8), non(3, 1), non(4, 1)];
    expect(rankShortlist(all, 1, [], 2).items.map((c) => c.id)).toEqual([3]);
    expect(rankShortlist(all, 1, [], 2).nonTechShortfall).toBe(0);
    expect(rankShortlist(all, 2, [], 0).items.map((c) => c.id)).toEqual([1, 2]);
  });
});

describe.skipIf(!testDatabaseUrl)("getShortlist (database)", () => {
  const db = useTestDb();

  async function seed(
    title: string,
    authors: number,
    market: { competition: number | null; buildability: number | null },
    vertical: "freelance" | "devtools" = "freelance",
  ) {
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
        vertical,
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

    const { items: list } = await getShortlist(db);

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
    expect((await getShortlist(db, 5, [a.id])).items.map((o) => o.id)).toEqual([b.id]);
  });

  it("is empty when nothing qualifies and respects the limit", async () => {
    expect((await getShortlist(db)).items).toEqual([]);
    for (let i = 0; i < 4; i++) await seed(`o${i}`, 2, { competition: 6, buildability: 6 });
    expect((await getShortlist(db, 2)).items).toHaveLength(2);
  });

  it("applies the non-tech quota using the opportunity's main vertical and reports it", async () => {
    for (let i = 0; i < 6; i++) await seed(`dev${i}`, 2, { competition: 9, buildability: 9 }, "devtools");
    const non = await seed("pyme", 2, { competition: 3, buildability: 3 }, "freelance");

    const { items, quota } = await getShortlist(db);

    expect(items).toHaveLength(5);
    expect(items.map((o) => o.id)).toContain(non.id);
    expect(quota).toEqual({ minNonTech: 2, nonTechCount: 1, shortfall: 1 });
  });
});
