import { describe, expect, it, vi } from "vitest";
import { signals } from "./db/schema";
import { ingest } from "./ingest";
import type { RawSignal, SourceAdapter } from "./sources/types";
import { testDatabaseUrl, useTestDb } from "./test-db";

function signal(id: string, publishedAt: string): RawSignal {
  return {
    externalId: id,
    url: `https://example.com/${id}`,
    title: `Post ${id}`,
    body: `Body ${id}`,
    author: "someone",
    publishedAt: new Date(publishedAt),
    metadata: {},
  };
}

function fakeAdapter(batches: RawSignal[][]): SourceAdapter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    id: "fake",
    domain: "software",
    calls,
    fetchSignals: vi.fn(async (options) => {
      calls.push(options);
      return batches.shift() ?? [];
    }),
  };
}

describe.skipIf(!testDatabaseUrl)("ingest (database)", () => {
  const db = useTestDb();

  it("stores fetched signals with source and domain", async () => {
    const adapter = fakeAdapter([[signal("a", "2026-10-01T00:00:00Z")]]);

    const result = await ingest(db, adapter);

    expect(result).toEqual({ source: "fake", fetched: 1, inserted: 1 });
    const rows = await db.select().from(signals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "fake",
      domain: "software",
      externalId: "a",
      url: "https://example.com/a",
      author: "someone",
      status: "pending",
    });
    expect(rows[0].publishedAt).toEqual(new Date("2026-10-01T00:00:00Z"));
  });

  it("does not duplicate existing signals and asks only for newer ones", async () => {
    const adapter = fakeAdapter([
      [signal("a", "2026-10-01T00:00:00Z"), signal("b", "2026-10-02T00:00:00Z")],
      [signal("b", "2026-10-02T00:00:00Z"), signal("c", "2026-10-03T00:00:00Z")],
    ]);

    await ingest(db, adapter);
    const second = await ingest(db, adapter);

    expect(second).toEqual({ source: "fake", fetched: 2, inserted: 1 });
    expect(adapter.calls).toEqual([{ since: undefined }, { since: new Date("2026-10-02T00:00:00Z") }]);
    expect(await db.$count(signals)).toBe(3);
  });

  it("handles an empty fetch", async () => {
    const result = await ingest(db, fakeAdapter([[]]));
    expect(result).toEqual({ source: "fake", fetched: 0, inserted: 0 });
  });
});
