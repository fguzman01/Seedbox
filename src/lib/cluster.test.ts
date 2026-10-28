import { describe, expect, it, vi } from "vitest";
import { clusterPendingPains } from "./cluster";
import type { ClusteringInput, ClusteringOutput, PainClusterer } from "./clustering";
import { opportunities, pains, signals } from "./db/schema";
import { getOpportunities, getOpportunity } from "./queries";
import { DEFAULT_WEIGHTS } from "./scoring";
import { testDatabaseUrl, useTestDb } from "./test-db";

/** Clusterer that groups pains by the first word of their description. */
function fakeClusterer(overrides: Partial<{ fail: boolean; skip: number[] }> = {}) {
  const calls: ClusteringInput[] = [];
  const clusterer: PainClusterer = {
    model: "fake-model",
    cluster: vi.fn(async (input: ClusteringInput) => {
      calls.push(input);
      if (overrides.fail) throw new Error("API down");
      const output: ClusteringOutput = { new_opportunities: [], assignments: [] };
      for (const pain of input.pains) {
        if (overrides.skip?.includes(pain.id)) continue;
        const topic = pain.description.split(" ")[0];
        const existing = input.opportunities.find((o) => o.title === topic);
        let ref = existing ? `o${existing.id}` : output.new_opportunities.find((o) => o.title === topic)?.ref;
        if (!ref) {
          ref = `n${output.new_opportunities.length + 1}`;
          output.new_opportunities.push({ ref, title: topic, summary: `Resumen ${topic}` });
        }
        output.assignments.push({ pain_id: pain.id, opportunity: ref });
      }
      return { output };
    }),
  };
  return { clusterer, calls };
}

describe.skipIf(!testDatabaseUrl)("clusterPendingPains (database)", () => {
  const db = useTestDb();

  /** Inserts one signal per entry with a pain whose description starts with the topic. */
  async function seed(entries: { topic: string; author: string }[]) {
    const offset = await db.$count(signals);
    const rows = await db
      .insert(signals)
      .values(
        entries.map((e, i) => ({
          source: "test",
          externalId: String(offset + i),
          url: `https://example.com/${offset + i}`,
          title: null,
          body: "b",
          author: e.author,
          publishedAt: new Date(Date.UTC(2026, 9, 1 + offset + i)),
          status: "processed" as const,
        })),
      )
      .returning({ id: signals.id });
    await db.insert(pains).values(
      entries.map((e, i) => ({
        signalId: rows[i].id,
        description: `${e.topic} es un problema`,
        persona: "p",
        quote: "q",
        vertical: "freelance" as const,
        intensity: "medium" as const,
        willingnessToPay: "none" as const,
        model: "m",
      })),
    );
  }

  it("creates opportunities, assigns every pain and reports evidence counts", async () => {
    await seed([
      { topic: "facturas", author: "ana" },
      { topic: "facturas", author: "bob" },
      { topic: "facturas", author: "ana" },
      { topic: "morosos", author: "carla" },
    ]);
    const { clusterer } = fakeClusterer();

    const result = await clusterPendingPains(db, clusterer, { batchSize: 10 });

    expect(result).toEqual({ batches: 1, assigned: 4, created: 2, unassigned: 0, failed: 0 });
    const list = await getOpportunities(DEFAULT_WEIGHTS, db);
    expect(list.map((o) => [o.title, o.signalCount, o.authorCount, o.painCount, o.mainVertical])).toEqual([
      ["facturas", 3, 2, 3, "freelance"],
      ["morosos", 1, 1, 1, "freelance"],
    ]);
    expect(list[0]).toMatchObject({ domain: "software", model: "fake-model", summary: "Resumen facturas" });

    const detail = await getOpportunity(list[0].id, DEFAULT_WEIGHTS, db);
    expect(detail?.pains).toHaveLength(3);
    expect(detail?.pains[0]).toMatchObject({ url: expect.stringContaining("https://example.com/"), source: "test" });
  });

  it("adds new pains to existing opportunities and never reprocesses clustered ones", async () => {
    await seed([{ topic: "facturas", author: "ana" }]);
    await clusterPendingPains(db, fakeClusterer().clusterer);

    await seed([{ topic: "facturas", author: "bob" }]);
    const { clusterer, calls } = fakeClusterer();
    const result = await clusterPendingPains(db, clusterer);

    expect(calls).toHaveLength(1);
    expect(calls[0].pains.map((p) => p.id)).toEqual([2]);
    expect(calls[0].opportunities.map((o) => o.title)).toEqual(["facturas"]);
    expect(result).toMatchObject({ assigned: 1, created: 0 });
    expect(await db.$count(opportunities)).toBe(1);
  });

  it("processes in batches and keeps skipped pains for the next run", async () => {
    await seed([
      { topic: "a", author: "1" },
      { topic: "b", author: "2" },
      { topic: "c", author: "3" },
    ]);
    const { clusterer, calls } = fakeClusterer({ skip: [2] });

    const result = await clusterPendingPains(db, clusterer, { batchSize: 2 });

    expect(calls.map((c) => c.pains.map((p) => p.id))).toEqual([[1, 2], [3]]);
    expect(result).toEqual({ batches: 2, assigned: 2, created: 2, unassigned: 1, failed: 0 });

    const retry = await clusterPendingPains(db, fakeClusterer().clusterer);
    expect(retry).toMatchObject({ assigned: 1, unassigned: 0 });
  });

  it("keeps pains unclustered when the API fails, without looping on them", async () => {
    await seed([{ topic: "a", author: "1" }, { topic: "b", author: "2" }]);
    const onError = vi.fn();
    const { clusterer, calls } = fakeClusterer({ fail: true });

    const result = await clusterPendingPains(db, clusterer, { batchSize: 1, onError });

    expect(calls).toHaveLength(2);
    expect(result).toEqual({ batches: 2, assigned: 0, created: 0, unassigned: 0, failed: 2 });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(await db.$count(opportunities)).toBe(0);
  });

  it("stops at maxBatches", async () => {
    await seed([{ topic: "a", author: "1" }, { topic: "b", author: "2" }, { topic: "c", author: "3" }]);
    const result = await clusterPendingPains(db, fakeClusterer().clusterer, { batchSize: 1, maxBatches: 2 });
    expect(result.batches).toBe(2);
    expect(result.assigned).toBe(2);
  });
});
