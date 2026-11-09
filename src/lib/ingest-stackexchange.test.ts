import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { ingestRuns, opportunities, pains, signals } from "./db/schema";
import { describeIngest, ingest, ingestAndRecord, planReconcile } from "./ingest";
import { getOpportunities } from "./queries";
import { DEFAULT_WEIGHTS } from "./scoring";
import { createStackExchangeAdapter } from "./sources/stackexchange";
import type { SourceAdapter } from "./sources/types";
import { testDatabaseUrl, useTestDb } from "./test-db";

const NOW = new Date("2026-11-04T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const unix = (date: Date) => Math.floor(date.getTime() / 1000);

describe("planReconcile", () => {
  const item = (id: number, missingSince?: string) => ({
    id,
    externalId: `money:${id}`,
    metadata: missingSince ? { site: "money", missingSince } : { site: "money" },
  });

  it("marks a first absence, deletes a second one in a row and clears items that came back", () => {
    const plan = planReconcile(
      [item(1), item(2, "2026-11-03T12:00:00Z"), item(3, "2026-11-03T12:00:00Z"), item(4)],
      ["money:1", "money:2"],
    );
    expect(plan).toEqual({ mark: [1], remove: [2], clear: [3] });
  });
});

describe("describeIngest", () => {
  it("logs per feed, the total and the deletion check", () => {
    expect(
      describeIngest({
        source: "stackexchange",
        fetched: 3,
        inserted: 2,
        feeds: [{ feed: "money", fetched: 30, filtered: 1, capped: 4, inserted: 2 }],
        reconcile: { checked: 10, missing: 1, deleted: 2 },
      }),
    ).toEqual([
      "money fetched=30 filtered=1 capped=4 inserted=2",
      "fetched=3 inserted=2",
      "deletion check: checked=10 missing=1 deleted=2 (deleted on the source)",
    ]);
    expect(describeIngest({ source: "hackernews", fetched: 1, inserted: 1 })).toEqual(["fetched=1 inserted=1"]);
  });
});

/** A fake Stack Exchange API: `sites` maps each site to its live questions. */
function fakeApi(sites: Record<string, { id: number; created: Date; score?: number; answers?: number }[]>) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    const site = url.searchParams.get("site")!;
    const live = sites[site] ?? [];
    const question = (q: (typeof live)[number]) => ({
      question_id: q.id,
      title: `Question ${q.id} &amp; more`,
      body: `<p>Body of ${q.id}</p>`,
      link: `https://${site}.stackexchange.com/questions/${q.id}/q`,
      score: q.score ?? 1,
      answer_count: q.answers ?? 0,
      tags: ["tag"],
      owner: { user_type: "registered", display_name: "someone", link: `https://${site}.stackexchange.com/users/1/someone` },
      creation_date: unix(q.created),
      content_license: "CC BY-SA 4.0",
    });
    let items;
    if (url.pathname === "/2.3/questions") {
      const from = Number(url.searchParams.get("fromdate"));
      const to = Number(url.searchParams.get("todate"));
      items = live.filter((q) => unix(q.created) >= from && unix(q.created) <= to).map(question);
    } else {
      const ids = new Set(url.pathname.split("/").pop()!.split(";").map(Number));
      items = live.filter((q) => ids.has(q.id)).map((q) => ({ question_id: q.id }));
    }
    return new Response(JSON.stringify({ items, has_more: false, quota_max: 10000, quota_remaining: 9000 }));
  });
  return { fetchImpl, calls };
}

describe.skipIf(!testDatabaseUrl)("ingest Stack Exchange (database)", () => {
  const db = useTestDb();

  const adapterFor = (fetchImpl: typeof fetch, now = NOW, maxNewPerFeed = 25) =>
    createStackExchangeAdapter({ key: "k", sites: ["money", "workplace"], fetchImpl, now: () => now, sleep: async () => {}, maxNewPerFeed });

  const daysBefore = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

  it("stores new questions per site without duplicates and reports each site", async () => {
    const api = fakeApi({
      money: [
        { id: 1, created: daysBefore(3) },
        { id: 2, created: daysBefore(2), score: -1 },
        { id: 3, created: daysBefore(2), answers: 2 },
        // Younger than 24 h: not asked for yet.
        { id: 4, created: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) },
      ],
      workplace: [{ id: 1, created: daysBefore(4) }],
    });

    const first = await ingest(db, adapterFor(api.fetchImpl, NOW, 1), { now: NOW });

    expect(first.feeds).toEqual([
      { feed: "money", fetched: 3, filtered: 1, capped: 1, inserted: 1 },
      { feed: "workplace", fetched: 1, filtered: 0, capped: 0, inserted: 1 },
    ]);
    const rows = await db.select().from(signals).orderBy(signals.externalId);
    expect(rows.map((r) => r.externalId)).toEqual(["money:3", "workplace:1"]);
    expect(rows[0]).toMatchObject({ source: "stackexchange", title: "Question 3 & more", body: "Body of 3", author: "someone" });
    expect(rows[0].metadata).toMatchObject({ site: "money", answerCount: 2, license: "CC BY-SA 4.0" });

    // The next day asks from the newest stored question on, and never stores it twice.
    const later = new Date(NOW.getTime() + DAY_MS);
    const second = await ingest(db, adapterFor(api.fetchImpl, later), { now: later });
    const lastFetch = api.calls.filter((u) => u.pathname === "/2.3/questions").at(-1)!;
    expect(lastFetch.searchParams.get("fromdate")).toBe(String(unix(daysBefore(2))));
    expect(second.inserted).toBe(1); // money:4, now older than 24 h
    expect(await db.$count(signals)).toBe(3);
  });

  it("deletes a question missing in two checks in a row, with its pains, and its opportunity stops showing", async () => {
    const live = { money: [{ id: 1, created: daysBefore(3) }, { id: 2, created: daysBefore(3) }], workplace: [] };
    const api = fakeApi(live);
    await ingest(db, adapterFor(api.fetchImpl), { now: NOW });
    const [deletedLater] = await db.select().from(signals).where(eq(signals.externalId, "money:2"));
    const [opportunity] = await db.insert(opportunities).values({ title: "Split bills", summary: "s", model: "test" }).returning();
    await db.insert(pains).values({
      signalId: deletedLater.id,
      opportunityId: opportunity.id,
      description: "d",
      persona: "p",
      quote: "Body of 2",
      vertical: "finance",
      intensity: "medium",
      willingnessToPay: "none",
      model: "test",
    });
    expect(await getOpportunities(DEFAULT_WEIGHTS, db)).toHaveLength(1);

    // Deleted on Stack Exchange.
    live.money = live.money.filter((q) => q.id !== 2);
    const day2 = new Date(NOW.getTime() + DAY_MS);
    const firstMiss = await ingest(db, adapterFor(api.fetchImpl, day2), { now: day2 });
    expect(firstMiss.reconcile).toEqual({ checked: 2, missing: 1, deleted: 0 });
    const [marked] = await db.select().from(signals).where(eq(signals.externalId, "money:2"));
    expect(marked.metadata).toMatchObject({ site: "money", missingSince: day2.toISOString() });

    const day3 = new Date(NOW.getTime() + 2 * DAY_MS);
    const secondMiss = await ingest(db, adapterFor(api.fetchImpl, day3), { now: day3 });
    expect(secondMiss.reconcile).toEqual({ checked: 2, missing: 0, deleted: 1 });
    expect((await db.select().from(signals)).map((s) => s.externalId)).toEqual(["money:1"]);
    expect(await db.$count(pains)).toBe(0);
    expect(await getOpportunities(DEFAULT_WEIGHTS, db)).toHaveLength(0);
  });

  it("keeps a question that comes back after one absence, and stops checking after 30 days", async () => {
    const live = { money: [{ id: 1, created: daysBefore(3) }], workplace: [] };
    const api = fakeApi(live);
    await ingest(db, adapterFor(api.fetchImpl), { now: NOW });

    live.money = [];
    const day2 = new Date(NOW.getTime() + DAY_MS);
    await ingest(db, adapterFor(api.fetchImpl, day2), { now: day2 });
    live.money = [{ id: 1, created: daysBefore(3) }];
    const day3 = new Date(NOW.getTime() + 2 * DAY_MS);
    expect((await ingest(db, adapterFor(api.fetchImpl, day3), { now: day3 })).reconcile).toEqual({ checked: 1, missing: 0, deleted: 0 });
    const [row] = await db.select().from(signals);
    expect(row.metadata).not.toHaveProperty("missingSince");

    // Stored more than 30 days ago: no longer looked up.
    await db.update(signals).set({ fetchedAt: new Date(day3.getTime() - 31 * DAY_MS) });
    live.money = [];
    expect((await ingest(db, adapterFor(api.fetchImpl, day3), { now: day3 })).reconcile).toEqual({ checked: 0, missing: 0, deleted: 0 });
    expect(await db.$count(signals)).toBe(1);
  });

  it("records a failing deletion check as an error but keeps what was stored", async () => {
    const api = fakeApi({ money: [{ id: 1, created: daysBefore(3) }], workplace: [] });
    const adapter = adapterFor(api.fetchImpl);
    const failing: SourceAdapter = {
      ...adapter,
      reconcile: async () => {
        throw new Error("Stack Exchange throttle_violation");
      },
    };

    // The fake questions are dated relative to NOW: ingest at NOW, not at the real clock.
    const result = await ingestAndRecord(db, "stackexchange", () => failing, { now: NOW });

    expect(result).toMatchObject({ status: "error", fetched: 1, inserted: 1 });
    expect(await db.select().from(ingestRuns)).toMatchObject([
      { source: "stackexchange", status: "error", fetched: 1, inserted: 1, message: "deletion check failed: Stack Exchange throttle_violation" },
    ]);
    expect(await db.$count(signals)).toBe(1);
  });

  it("is skipped with the real adapters when STACKEXCHANGE_KEY is missing", async () => {
    const saved = process.env.STACKEXCHANGE_KEY;
    delete process.env.STACKEXCHANGE_KEY;
    try {
      const result = await ingestAndRecord(db, "stackexchange");
      expect(result.status).toBe("skipped");
      expect(await db.select().from(ingestRuns)).toMatchObject([{ source: "stackexchange", status: "skipped" }]);
    } finally {
      if (saved !== undefined) process.env.STACKEXCHANGE_KEY = saved;
    }
  });
});
