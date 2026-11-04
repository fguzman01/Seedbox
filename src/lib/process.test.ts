import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { pains, signals } from "./db/schema";
import type { ExtractionInput, PainExtractor } from "./extraction";
import type { ExtractedPain } from "./pains";
import { getPendingSignals, processPendingSignals } from "./process";
import { testDatabaseUrl, useTestDb } from "./test-db";

const pain: ExtractedPain = {
  description: "Facturar es lento",
  persona: "agencias",
  quote: "invoices",
  vertical: "freelance",
  intensity: "high",
  willingness_to_pay: "explicit",
};

/** Extractor whose behavior depends on the post body: "pain", "nothing" or "boom". */
function fakeExtractor(): PainExtractor & { calls: ExtractionInput[] } {
  const calls: ExtractionInput[] = [];
  return {
    model: "fake-model",
    calls,
    extract: vi.fn(async (input: ExtractionInput) => {
      calls.push(input);
      if (input.body === "boom") throw new Error("API down");
      return { pains: input.body === "pain" ? [pain, { ...pain, intensity: "low" as const }] : [] };
    }),
  };
}

describe.skipIf(!testDatabaseUrl)("processPendingSignals (database)", () => {
  const db = useTestDb();

  async function seed(...bodies: string[]) {
    await db.insert(signals).values(
      bodies.map((body, i) => ({
        source: "test",
        externalId: String(i),
        url: `https://example.com/${i}`,
        title: null,
        body,
        author: null,
        publishedAt: new Date(Date.UTC(2026, 9, 1 + i)),
      })),
    );
  }

  it("stores pains, discards signals without pains and keeps failures pending", async () => {
    await seed("pain", "nothing", "boom");
    const onError = vi.fn();

    const result = await processPendingSignals(db, fakeExtractor(), { onError });

    expect(result).toEqual({ processed: 1, discarded: 1, failed: 1, pains: 2 });
    expect(onError).toHaveBeenCalledOnce();

    const rows = await db.select().from(signals).orderBy(signals.id);
    expect(rows.map((r) => r.status)).toEqual(["processed", "discarded", "pending"]);
    expect(rows[0].processedAt).toBeInstanceOf(Date);
    expect(rows[2].processedAt).toBeNull();

    const stored = await db.select().from(pains).where(eq(pains.signalId, rows[0].id));
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      description: "Facturar es lento",
      persona: "agencias",
      quote: "invoices",
      vertical: "freelance",
      willingnessToPay: "explicit",
      model: "fake-model",
    });
  });

  it("never reprocesses processed or discarded signals", async () => {
    await seed("pain", "nothing", "boom");
    await processPendingSignals(db, fakeExtractor());

    const extractor = fakeExtractor();
    const second = await processPendingSignals(db, extractor);

    expect(extractor.calls.map((c) => c.body)).toEqual(["boom"]);
    expect(second).toEqual({ processed: 0, discarded: 0, failed: 1, pains: 0 });
    expect(await db.$count(pains)).toBe(2);
  });

  it("respects the limit, most recent first when posts have no activity (H11)", async () => {
    await seed("pain", "nothing", "nothing");
    const extractor = fakeExtractor();

    await processPendingSignals(db, extractor, { limit: 2, concurrency: 1 });

    expect(extractor.calls.map((c) => c.body)).toEqual(["nothing", "nothing"]);
    const rows = await db.select().from(signals).orderBy(signals.id);
    expect(rows.map((r) => r.status)).toEqual(["pending", "discarded", "discarded"]);
  });
});

describe.skipIf(!testDatabaseUrl)("getPendingSignals (database)", () => {
  const db = useTestDb();
  const now = new Date("2026-11-04T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  let n = 0;

  async function insert(source: string, metadata: Record<string, unknown>, { fetchedAt = daysAgo(1), publishedAt = daysAgo(2), status = "pending" }: { fetchedAt?: Date; publishedAt?: Date; status?: "pending" | "processed" | "discarded" } = {}) {
    const [row] = await db
      .insert(signals)
      .values({ source, externalId: String(n++), url: `https://example.com/${n}`, title: null, body: "b", author: null, publishedAt, fetchedAt, metadata, status })
      .returning();
    return row.id;
  }

  it("shares the batch between sources and orders each by activity", async () => {
    // Hacker News has more, older and busier posts: it must not take the whole batch.
    const hn = [];
    for (let i = 0; i < 6; i++) hn.push(await insert("hackernews", { numComments: 10 * i, points: 1 }, { publishedAt: daysAgo(40) }));
    const quiet = await insert("reddit", { numComments: 0, score: 1 });
    const busy = await insert("reddit", { numComments: 3, score: 0 });
    await insert("reddit", { numComments: 99 }, { status: "processed" });

    const batch = await getPendingSignals(db, 4, { now, maxPendingDays: 14 });

    expect(batch.map((s) => s.id)).toEqual([hn[5], busy, hn[4], quiet]);
    expect(batch[0]).toMatchObject({ source: "hackernews", body: "b", status: "pending" });
  });

  it("lets posts pending for more than N days take up to half of their source's share", async () => {
    const agedQuiet = await insert("hackernews", { numComments: 0 }, { fetchedAt: daysAgo(20) });
    const active = [];
    for (let i = 0; i < 3; i++) active.push(await insert("hackernews", { numComments: 50 - i }));

    expect((await getPendingSignals(db, 2, { now, maxPendingDays: 14 })).map((s) => s.id)).toEqual([agedQuiet, active[0]]);
    // With a longer N the same post is not aged and waits behind the busier ones.
    expect((await getPendingSignals(db, 2, { now, maxPendingDays: 30 })).map((s) => s.id)).toEqual([active[0], active[1]]);
  });

  it("returns nothing when no post is pending", async () => {
    await insert("hackernews", {}, { status: "discarded" });
    expect(await getPendingSignals(db, 10)).toEqual([]);
  });
});
