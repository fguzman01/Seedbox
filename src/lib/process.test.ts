import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { pains, signals } from "./db/schema";
import type { ExtractionInput, PainExtractor } from "./extraction";
import type { ExtractedPain } from "./pains";
import { processPendingSignals } from "./process";
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

  it("respects the limit, oldest first", async () => {
    await seed("nothing", "pain", "nothing");
    const extractor = fakeExtractor();

    await processPendingSignals(db, extractor, { limit: 2, concurrency: 1 });

    expect(extractor.calls.map((c) => c.body)).toEqual(["nothing", "pain"]);
  });
});
