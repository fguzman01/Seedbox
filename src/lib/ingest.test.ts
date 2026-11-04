import { describe, expect, it, vi } from "vitest";
import { ingestRuns, signals } from "./db/schema";
import { ingest, ingestAndRecord } from "./ingest";
import { SourceNotConfiguredError, type RawSignal, type SourceAdapter } from "./sources/types";
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

    const now = new Date("2026-10-05T12:00:00Z");
    await ingest(db, adapter, { now });
    const second = await ingest(db, adapter, { now });

    expect(second).toEqual({ source: "fake", fetched: 2, inserted: 1 });
    const until = new Date("2026-10-04T12:00:00Z"); // 24 h before `now` by default (ADR-0009)
    expect(adapter.calls).toEqual([
      { since: undefined, until },
      { since: new Date("2026-10-02T00:00:00Z"), until },
    ]);
    expect(await db.$count(signals)).toBe(3);
  });

  it("asks only for posts at least minAgeHours old", async () => {
    const adapter = fakeAdapter([[]]);
    await ingest(db, adapter, { now: new Date("2026-10-05T12:00:00Z"), minAgeHours: 6 });
    expect(adapter.calls).toEqual([{ since: undefined, until: new Date("2026-10-05T06:00:00Z") }]);
  });

  it("handles an empty fetch", async () => {
    const result = await ingest(db, fakeAdapter([[]]));
    expect(result).toEqual({ source: "fake", fetched: 0, inserted: 0 });
  });

  describe("ingestAndRecord", () => {
    const runs = () => db.select().from(ingestRuns).orderBy(ingestRuns.id);

    it("records a successful run with its counts", async () => {
      const adapter = fakeAdapter([[signal("a", "2026-10-01T00:00:00Z"), signal("b", "2026-10-02T00:00:00Z")]]);

      const result = await ingestAndRecord(db, "fake", () => adapter);

      expect(result).toEqual({ source: "fake", fetched: 2, inserted: 2, status: "ok" });
      const [run] = await runs();
      expect(run).toMatchObject({ source: "fake", status: "ok", fetched: 2, inserted: 2, message: null });
      expect(run.ranAt).toBeInstanceOf(Date);
    });

    it("records a source without configuration as skipped, not as a run with no posts", async () => {
      const result = await ingestAndRecord(db, "reddit", () => {
        throw new SourceNotConfiguredError("Reddit is not configured");
      });

      expect(result).toMatchObject({ source: "reddit", status: "skipped", fetched: 0, inserted: 0 });
      expect(await runs()).toMatchObject([
        { source: "reddit", status: "skipped", fetched: 0, inserted: 0, message: "Reddit is not configured" },
      ]);
    });

    it("records a failing source as an error without throwing", async () => {
      const adapter: SourceAdapter = {
        id: "fake",
        domain: "software",
        fetchSignals: async () => {
          throw new Error("API responded 503");
        },
      };

      const result = await ingestAndRecord(db, "fake", () => adapter);

      expect(result.status).toBe("error");
      expect(result.error).toBeInstanceOf(Error);
      expect(await runs()).toMatchObject([{ source: "fake", status: "error", message: "API responded 503" }]);
      expect(await db.$count(signals)).toBe(0);
    });

    it("records Reddit as skipped with the real adapters when its variables are missing", async () => {
      const saved = { id: process.env.REDDIT_CLIENT_ID, secret: process.env.REDDIT_CLIENT_SECRET };
      delete process.env.REDDIT_CLIENT_ID;
      delete process.env.REDDIT_CLIENT_SECRET;
      try {
        expect((await ingestAndRecord(db, "reddit")).status).toBe("skipped");
      } finally {
        if (saved.id !== undefined) process.env.REDDIT_CLIENT_ID = saved.id;
        if (saved.secret !== undefined) process.env.REDDIT_CLIENT_SECRET = saved.secret;
      }
    });
  });
});
