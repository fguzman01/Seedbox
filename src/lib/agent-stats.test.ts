import { describe, expect, it } from "vitest";
import { clampStatsDays, getAgentStats } from "./agent-stats";
import { opportunities, pains, signals } from "./db/schema";
import { testDatabaseUrl, useTestDb } from "./test-db";

describe("clampStatsDays", () => {
  it("defaults to 30 and caps at 365", () => {
    expect(clampStatsDays(null)).toBe(30);
    expect(clampStatsDays("")).toBe(30);
    expect(clampStatsDays("abc")).toBe(30);
    expect(clampStatsDays("0")).toBe(30);
    expect(clampStatsDays("7")).toBe(7);
    expect(clampStatsDays("9999")).toBe(365);
  });
});

describe.skipIf(!testDatabaseUrl)("getAgentStats (database)", () => {
  const db = useTestDb();
  const now = new Date("2026-11-16T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  async function signal(
    id: string,
    source: string,
    status: "pending" | "processed" | "discarded",
    fetchedAt: Date,
    author: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    const [row] = await db
      .insert(signals)
      .values({
        source,
        externalId: id,
        url: `https://example.com/${id}`,
        title: "SECRET TITLE",
        body: "SECRET BODY",
        author,
        publishedAt: fetchedAt,
        fetchedAt,
        status,
        metadata,
        processedAt: status === "pending" ? null : fetchedAt,
      })
      .returning();
    return row;
  }

  async function pain(signalId: number, vertical: "devtools" | "freelance", opportunityId: number | null, createdAt: Date) {
    await db.insert(pains).values({
      signalId,
      opportunityId,
      description: "SECRET DESCRIPTION",
      persona: "p",
      quote: "SECRET QUOTE",
      vertical,
      intensity: "high",
      willingnessToPay: "explicit",
      model: "m",
      createdAt,
    });
  }

  it("counts per source, vertical, devtools and shortlist authors inside the window, without any text", async () => {
    const hn = await signal("hn1", "hackernews", "processed", daysAgo(2), "alice");
    const hnOld = await signal("hn-old", "hackernews", "processed", daysAgo(60), "bob");
    const rd = await signal("rd1", "reddit", "processed", daysAgo(3), "carol", { subreddit: "SaaS" });
    await signal("rd2", "reddit", "discarded", daysAgo(3), "dave", { subreddit: "SaaS" });
    await signal("rd3", "reddit", "pending", daysAgo(1), "erin", { subreddit: "SaaS" });

    const [opp] = await db
      .insert(opportunities)
      .values({
        title: "SECRET OPP",
        summary: "SECRET SUMMARY",
        model: "m",
        competitionScore: 8,
        buildabilityScore: 8,
        createdAt: daysAgo(2),
      })
      .returning();
    const second = await signal("hn2", "hackernews", "processed", daysAgo(2), "frank");
    await pain(hn.id, "devtools", opp.id, daysAgo(2));
    await pain(second.id, "devtools", opp.id, daysAgo(2));
    await pain(rd.id, "freelance", null, daysAgo(3));
    await pain(hnOld.id, "freelance", null, daysAgo(60));

    const stats = await getAgentStats(db, 30, now);

    expect(stats.days).toBe(30);
    expect(stats.posts).toEqual({ ingested: 5, pains: 3 });
    const hnStats = stats.sources.find((s) => s.source === "hackernews")!;
    expect(hnStats).toMatchObject({ ingested: 2, processed: 2, discarded: 0, pains: 2, devPercent: 100 });
    const rdStats = stats.sources.find((s) => s.source === "reddit")!;
    expect(rdStats).toMatchObject({ ingested: 3, processed: 2, discarded: 1, pains: 1, devPercent: 0 });
    expect(rdStats.feeds[0]).toMatchObject({ feed: "SaaS", ingested: 3, discarded: 1 });
    expect(stats.painsByVertical).toEqual([
      { vertical: "devtools", pains: 2, percent: 67 },
      { vertical: "freelance", pains: 1, percent: 33 },
    ]);
    expect(stats.devPains).toEqual({ vertical: "devtools", pains: 2, percent: 67 });
    expect(stats.opportunitiesByVertical).toEqual([{ vertical: "devtools", opportunities: 1 }]);
    expect(stats.shortlist).toEqual({ size: 1, distinctAuthors: [2] });

    const json = JSON.stringify(stats);
    for (const text of ["SECRET", "alice", "bob", "carol", "frank", "example.com"]) expect(json).not.toContain(text);
  });

  it("widens the window with more days", async () => {
    const old = await signal("old", "hackernews", "processed", daysAgo(60), "bob");
    await pain(old.id, "freelance", null, daysAgo(60));
    expect((await getAgentStats(db, 30, now)).posts).toEqual({ ingested: 0, pains: 0 });
    expect((await getAgentStats(db, 90, now)).posts).toEqual({ ingested: 1, pains: 1 });
  });
});
