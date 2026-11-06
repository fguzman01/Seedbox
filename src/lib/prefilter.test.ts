import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signals } from "./db/schema";
import { DEFAULT_DATASET_PATH, isLabeled, parseDataset } from "./eval/dataset";
import { evalItemAsSignal, evaluatePrefilter } from "./eval/prefilter";
import {
  matchNoiseRule,
  NOISE_RULES,
  prefilterPending,
  prefilterReason,
  prefilterRuleId,
  type PrefilterInput,
} from "./prefilter";
import { getAgentStatus, getExtractWork } from "./agent";
import { getPendingSignals } from "./process";
import { testDatabaseUrl, useTestDb } from "./test-db";

const post = (overrides: Partial<PrefilterInput> = {}): PrefilterInput => ({
  source: "hackernews",
  title: "Ask HN: How do you invoice clients?",
  body: "Every tool I tried is too expensive.",
  author: "someone",
  metadata: {},
  ...overrides,
});

const ruleOf = (overrides: Partial<PrefilterInput>) => matchNoiseRule(post(overrides))?.id ?? null;

describe("hn-monthly-thread", () => {
  it.each([
    "Ask HN: Who is hiring? (November 2026)",
    "Ask HN: Who wants to be hired? (November 2026)",
    "Ask HN: Freelancer? Seeking freelancer? (March 2027)",
    "Ask HN: What are you working on? (November 2026)",
    "ask hn: who is hiring? (DECEMBER 2026)",
    "  Ask HN: Who is hiring? (January 2027)  ",
  ])("matches the monthly thread %j", (title) => {
    expect(ruleOf({ title, author: null })).toBe("hn-monthly-thread");
  });

  it("matches anything posted by whoishiring", () => {
    expect(ruleOf({ title: "Some new monthly thread", author: "whoishiring" })).toBe("hn-monthly-thread");
  });

  it.each([
    "Ask HN: What are you working on?",
    "Ask HN: Who is hiring?",
    "Ask HN: Who is hiring remote juniors in Europe?",
    "Ask HN: Who is hiring? (November 2026) Asking for my team",
    "Ask HN: What are you working on? (Nov 2026)",
    "Ask HN: What Are You Working on (Oct 2026)",
    "Ask HN: Who is hiring? (Smarch 2026)",
    "Ask HN: Who is hiring? (November 26)",
    "Re: Ask HN: Who is hiring? (November 2026)",
    "Ask HN: Who wants to be hired after 50? (November 2026)",
  ])("does not match the near miss %j", (title) => {
    expect(ruleOf({ title, author: "someone" })).toBeNull();
  });

  it("only applies to Hacker News, by title or by author", () => {
    expect(ruleOf({ source: "reddit", title: "Ask HN: Who is hiring? (November 2026)" })).toBeNull();
    expect(ruleOf({ source: "reddit", author: "whoishiring" })).toBeNull();
    expect(ruleOf({ source: "stackexchange", author: "whoishiring" })).toBeNull();
  });

  it("does not match a null title from another author", () => {
    expect(ruleOf({ title: null, body: "Who is hiring? (November 2026)" })).toBeNull();
  });
});

describe("empty", () => {
  it.each(["hackernews", "reddit", "stackexchange"])("matches a post without title nor text in %s", (source) => {
    expect(ruleOf({ source, title: null, body: "" })).toBe("empty");
    expect(ruleOf({ source, title: "  ", body: " \n\t " })).toBe("empty");
  });

  it("does not match a post with only a title or only a body, however short", () => {
    expect(ruleOf({ title: "Help", body: "" })).toBeNull();
    expect(ruleOf({ title: null, body: "?" })).toBeNull();
    expect(ruleOf({ title: "Ask HN: Anyone else jobless after 50?", body: "Ask HN: Anyone else jobless after 50?" })).toBeNull();
  });
});

describe("rules never look at topic or tone", () => {
  it.each([
    "Tell HN: Scribd Breached",
    "Tell HN: Please Vote",
    "Ask HN: Is the Microsoft buyout just a long overdue correction?",
    "Show HN: My invoicing tool",
    "Launch HN: Acme (YC W26)",
  ])("keeps %j", (title) => {
    expect(matchNoiseRule(post({ title, body: title }))).toBeNull();
  });
});

describe("prefilter reason", () => {
  it("shows the rule label, or the bare id of a removed rule", () => {
    expect(prefilterReason("hn-monthly-thread")).toBe("prefiltro: hilo mensual de Hacker News");
    expect(prefilterReason("empty")).toBe("prefiltro: post sin texto");
    expect(prefilterReason("old-rule")).toBe("prefiltro: old-rule");
  });

  it("reads the rule id from the metadata", () => {
    expect(prefilterRuleId({ prefilter: "empty", points: 3 })).toBe("empty");
    expect(prefilterRuleId({ points: 3 })).toBeNull();
    expect(prefilterRuleId({ prefilter: 1 })).toBeNull();
    expect(prefilterRuleId(null)).toBeNull();
  });

  it("has unique rule ids", () => {
    expect(new Set(NOISE_RULES.map((r) => r.id)).size).toBe(NOISE_RULES.length);
  });
});

describe("dataset v1 (H13 acceptance criterion)", () => {
  const items = parseDataset(readFileSync(DEFAULT_DATASET_PATH, "utf8")).filter(isLabeled);

  it("has labeled posts with pain to check against", () => {
    expect(items.some((item) => item.expected.length > 0)).toBe(true);
  });

  it("never discards a post labeled with a concrete or latent pain", () => {
    const lost = items
      .filter((item) => item.expected.length > 0)
      .map((item) => ({ id: item.id, title: item.title, rule: matchNoiseRule(evalItemAsSignal(item))?.id ?? null }))
      .filter((item) => item.rule !== null);
    expect(lost).toEqual([]);
  });

  it("reports the saving over the posts without pain", () => {
    const report = evaluatePrefilter(items);
    expect(report.lost).toEqual([]);
    expect(report.total).toBe(items.length);
    expect(report.withPain + report.withoutPain).toBe(report.total);
    expect(report.saved).toBe(report.discarded.length);
    expect(report.byRule.reduce((n, r) => n + r.count, 0)).toBe(report.discarded.length);
  });
});

describe("evaluatePrefilter", () => {
  it("counts the lost pains and the saving", () => {
    const base = { source: "hackernews", url: "https://news.ycombinator.com/item?id=1", body: "text" };
    const report = evaluatePrefilter([
      { ...base, id: "a", title: "Ask HN: Who is hiring? (November 2026)", expected: [] },
      { ...base, id: "b", title: "Ask HN: Who is hiring? (December 2026)", expected: [{ quote: "text", vertical: "career" }] },
      { ...base, id: "c", title: "Ask HN: How do you invoice?", expected: [] },
      { ...base, id: "d", title: "Ask HN: Who is hiring? (January 2027)", expected: null },
    ]);
    expect(report).toMatchObject({ total: 3, withPain: 1, withoutPain: 2, saved: 1, savedPercent: 50 });
    expect(report.lost.map((d) => d.item.id)).toEqual(["b"]);
    expect(report.byRule).toEqual([
      { id: "hn-monthly-thread", label: "hilo mensual de Hacker News", count: 2 },
      { id: "empty", label: "post sin texto", count: 0 },
    ]);
  });
});

describe.skipIf(!testDatabaseUrl)("prefilterPending (database)", () => {
  const db = useTestDb();
  const now = new Date("2026-11-06T12:00:00Z");
  let n = 0;

  async function seed(
    overrides: Partial<typeof signals.$inferInsert> & { title: string | null; body: string },
  ): Promise<number> {
    n++;
    const [row] = await db
      .insert(signals)
      .values({
        source: "hackernews",
        externalId: `x-${n}`,
        url: `https://news.ycombinator.com/item?id=${n}`,
        author: "someone",
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        metadata: { points: 10, numComments: 300 },
        ...overrides,
      })
      .returning({ id: signals.id });
    return row.id;
  }

  const read = async (id: number) => (await db.select().from(signals)).find((s) => s.id === id)!;

  it("discards only matching pending posts, recording the rule and keeping the other metadata", async () => {
    const hiring = await seed({ title: "Ask HN: Who is hiring? (November 2026)", body: "Please state the location" });
    const byAuthor = await seed({ title: "Ask HN: Freelancer? (November 2026)", body: "x", author: "whoishiring" });
    const empty = await seed({ source: "reddit", title: "", body: "  ", metadata: { subreddit: "SaaS" } });
    const keep = await seed({ title: "Ask HN: How do you invoice clients?", body: "Too expensive." });

    const result = await prefilterPending(db, now);
    expect(result).toEqual({ discarded: 3, byRule: { "hn-monthly-thread": 2, empty: 1 } });

    const marked = await read(hiring);
    expect(marked).toMatchObject({ status: "discarded", processedAt: now });
    expect(marked.metadata).toEqual({ points: 10, numComments: 300, prefilter: "hn-monthly-thread" });
    expect((await read(byAuthor)).metadata).toMatchObject({ prefilter: "hn-monthly-thread" });
    expect(await read(empty)).toMatchObject({ status: "discarded", metadata: { subreddit: "SaaS", prefilter: "empty" } });
    expect(await read(keep)).toMatchObject({ status: "pending", processedAt: null, metadata: { points: 10, numComments: 300 } });

    // Idempotent: a second hand-out changes nothing.
    expect(await prefilterPending(db, new Date("2026-11-07T12:00:00Z"))).toEqual({ discarded: 0, byRule: {} });
    expect((await read(hiring)).processedAt).toEqual(now);
  });

  it("never touches processed posts or posts discarded by the analyst", async () => {
    const before = new Date("2026-11-02T00:00:00Z");
    const processed = await seed({
      title: "Ask HN: Who is hiring? (October 2026)",
      body: "x",
      status: "processed",
      processedAt: before,
    });
    const analystDiscarded = await seed({
      title: "Ask HN: What are you working on? (October 2026)",
      body: "x",
      status: "discarded",
      processedAt: before,
    });

    expect(await prefilterPending(db, now)).toEqual({ discarded: 0, byRule: {} });
    for (const id of [processed, analystDiscarded]) {
      const row = await read(id);
      expect(row.processedAt).toEqual(before);
      expect(row.metadata).not.toHaveProperty("prefilter");
    }
    expect((await read(processed)).status).toBe("processed");
    expect((await read(analystDiscarded)).status).toBe("discarded");
  });

  it("runs when the extraction work is handed out, so matching posts are never delivered", async () => {
    const hiring = await seed({ title: "Ask HN: Who is hiring? (November 2026)", body: "Please state the location" });
    const keep = await seed({ title: "Ask HN: How do you invoice clients?", body: "Too expensive.", metadata: { numComments: 1 } });

    const batch = await getPendingSignals(db, 10, { now });
    expect(batch.map((s) => s.id)).toEqual([keep]);
    expect(await read(hiring)).toMatchObject({ status: "discarded", metadata: { prefilter: "hn-monthly-thread" } });
  });

  it("applies to the analyst's extract work but not to the status count", async () => {
    const hiring = await seed({ title: "Ask HN: Who wants to be hired? (November 2026)", body: "Location:" });
    await seed({ title: "Ask HN: How do you invoice clients?", body: "Too expensive." });

    expect((await getAgentStatus(db)).extract).toBe(2);
    expect((await read(hiring)).status).toBe("pending");

    const work = await getExtractWork(db, 10);
    expect(work.items.map((i) => i.title)).toEqual(["Ask HN: How do you invoice clients?"]);
    expect((await getAgentStatus(db)).extract).toBe(1);
  });
});
