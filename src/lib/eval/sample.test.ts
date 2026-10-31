import { describe, expect, it } from "vitest";
import { signals } from "../db/schema";
import { testDatabaseUrl, useTestDb } from "../test-db";
import { sampleSignals } from "./sample";

describe.skipIf(!testDatabaseUrl)("sampleSignals (database)", () => {
  const db = useTestDb();

  it("returns unlabeled items for signals not already in the dataset", async () => {
    await db.insert(signals).values(
      ["a", "b", "c"].map((id) => ({
        source: "hackernews",
        externalId: id,
        url: `https://example.com/${id}`,
        title: `Post ${id}`,
        body: `Body ${id}`,
        author: null,
        publishedAt: new Date("2026-10-01T00:00:00Z"),
      })),
    );
    const existing = [
      { id: "hackernews:a", source: "hackernews", url: "", title: null, body: "", expected: [] },
    ];

    const sampled = await sampleSignals(db, existing, 5);

    expect(sampled.map((s) => s.id).sort()).toEqual(["hackernews:b", "hackernews:c"]);
    expect(sampled[0]).toMatchObject({ source: "hackernews", expected: null });
  });

  it("respects the count", async () => {
    await db.insert(signals).values(
      ["a", "b", "c"].map((id) => ({
        source: "hackernews",
        externalId: id,
        url: "u",
        title: null,
        body: "b",
        author: null,
        publishedAt: new Date(),
      })),
    );
    expect(await sampleSignals(db, [], 2)).toHaveLength(2);
  });
});
