import { describe, expect, it } from "vitest";
import { opportunities, pains, signals, type Pain } from "./db/schema";
import { isWeakEvidence } from "./evidence";
import { applyFilters, DEFAULT_FILTERS, parseFilters } from "./filters";
import { getOpportunities, getOpportunity } from "./queries";
import { DEFAULT_WEIGHTS, frequencyScore } from "./scoring";
import { testDatabaseUrl, useTestDb } from "./test-db";

describe.skipIf(!testDatabaseUrl)("getOpportunities (database)", () => {
  const db = useTestDb();

  it("returns every vertical and the most telling quote with its source", async () => {
    const [opportunity] = await db
      .insert(opportunities)
      .values({ title: "Facturación", summary: "…", model: "m" })
      .returning();
    const evidence: Pick<Pain, "quote" | "vertical" | "intensity" | "willingnessToPay">[] = [
      { quote: "mild", vertical: "freelance", intensity: "low", willingnessToPay: "explicit" },
      { quote: "strong, no money", vertical: "finance", intensity: "high", willingnessToPay: "none" },
      { quote: "strong, would pay", vertical: "freelance", intensity: "high", willingnessToPay: "explicit" },
    ];
    for (const [i, pain] of evidence.entries()) {
      const [signal] = await db
        .insert(signals)
        .values({ source: "test", externalId: String(i), url: `https://example.com/${i}`, title: null, body: "b", author: `a${i}`, publishedAt: new Date() })
        .returning();
      await db.insert(pains).values({ ...pain, signalId: signal.id, opportunityId: opportunity.id, description: "d", persona: "p", model: "m" });
    }

    const [row] = await getOpportunities(DEFAULT_WEIGHTS, db);

    expect(row.verticals.sort()).toEqual(["finance", "freelance"]);
    expect(row.mainVertical).toBe("freelance");
    expect(row.topQuote).toBe("strong, would pay");
    expect(row.topQuoteUrl).toBe("https://example.com/2");
  });

  describe("distinct authors and weak evidence (H12)", () => {
    let nextSignal = 0;

    async function opportunity(title: string) {
      const [row] = await db.insert(opportunities).values({ title, summary: "…", model: "m" }).returning();
      return row.id;
    }

    /** One signal with one pain in the opportunity, as clustering leaves it. */
    async function evidence(opportunityId: number, source: string, author: string | null) {
      const i = nextSignal++;
      const [signal] = await db
        .insert(signals)
        .values({ source, externalId: String(i), url: `https://example.com/${i}`, title: null, body: "b", author, publishedAt: new Date() })
        .returning();
      await db.insert(pains).values({
        signalId: signal.id,
        opportunityId,
        description: "d",
        persona: "p",
        quote: `q${i}`,
        vertical: "smb",
        intensity: "medium",
        willingnessToPay: "none",
        model: "m",
      });
    }

    const byTitle = async () =>
      Object.fromEntries((await getOpportunities(DEFAULT_WEIGHTS, db)).map((o) => [o.title, o]));

    it("counts (source, author) pairs and ignores signals without an author", async () => {
      const repeated = await opportunity("repeated");
      await evidence(repeated, "hackernews", "ana");
      await evidence(repeated, "hackernews", "ana");
      const crossSource = await opportunity("cross-source");
      await evidence(crossSource, "hackernews", "ana");
      await evidence(crossSource, "reddit", "ana");
      const anonymous = await opportunity("anonymous");
      await evidence(anonymous, "hackernews", null);
      await evidence(anonymous, "reddit", null);
      const mixed = await opportunity("mixed");
      await evidence(mixed, "hackernews", "ana");
      await evidence(mixed, "hackernews", null);

      const rows = await byTitle();
      expect(rows.repeated.authorCount).toBe(1);
      expect(rows["cross-source"].authorCount).toBe(2);
      expect(rows.anonymous.authorCount).toBe(0);
      expect(rows.mixed.authorCount).toBe(1);
      expect((await getOpportunity(crossSource, DEFAULT_WEIGHTS, db))?.authorCount).toBe(2);
      // The frequency axis reads the same count, so the mark adds nothing to the score.
      for (const row of Object.values(rows)) expect(row.axes.frequency).toBe(frequencyScore(row.authorCount));
    });

    it("stops being weak once a later clustering run adds a second author", async () => {
      const id = await opportunity("growing");
      await evidence(id, "hackernews", "ana");
      const before = (await getOpportunity(id, DEFAULT_WEIGHTS, db))!;
      expect(isWeakEvidence(before.authorCount)).toBe(true);

      await evidence(id, "stackexchange", "bruno");
      const after = (await getOpportunity(id, DEFAULT_WEIGHTS, db))!;
      expect(after.authorCount).toBe(2);
      expect(isWeakEvidence(after.authorCount)).toBe(false);
    });

    it("filters the dashboard by minimum distinct authors from the URL, with the other filters", async () => {
      const one = await opportunity("one author");
      await evidence(one, "hackernews", "ana");
      const two = await opportunity("two authors");
      await evidence(two, "hackernews", "ana");
      await evidence(two, "reddit", "ana");
      const three = await opportunity("three authors");
      await evidence(three, "hackernews", "ana");
      await evidence(three, "hackernews", "bruno");
      await evidence(three, "reddit", "carla");
      await evidence(three, "reddit", null);

      const all = await getOpportunities(DEFAULT_WEIGHTS, db);
      const titles = (params: Record<string, string>) =>
        applyFilters(all, parseFilters(params)).items.map((o) => o.title).sort();

      expect(applyFilters(all, DEFAULT_FILTERS).total).toBe(3);
      expect(titles({ authors: "2" })).toEqual(["three authors", "two authors"]);
      expect(titles({ authors: "3" })).toEqual(["three authors"]);
      expect(titles({ authors: "2", q: "two" })).toEqual(["two authors"]);
      expect(titles({ authors: "3", paying: "1" })).toEqual([]);
    });
  });
});
