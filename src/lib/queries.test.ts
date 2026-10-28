import { describe, expect, it } from "vitest";
import { opportunities, pains, signals, type Pain } from "./db/schema";
import { getOpportunities } from "./queries";
import { DEFAULT_WEIGHTS } from "./scoring";
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
});
