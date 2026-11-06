import { describe, expect, it } from "vitest";
import { ingestRuns, pains, signals } from "./db/schema";
import { VERTICAL_LABELS, type Vertical } from "./pains";
import {
  activityHref,
  buildSourceMix,
  describeActivityFilter,
  getFilteredPains,
  getFilteredSignals,
  getLastIngestRuns,
  getSourceMix,
  mixWindowStart,
  parseActivityFilter,
  percent,
  sourceState,
  type PainCountRow,
  type SignalCountRow,
} from "./source-mix";
import { testDatabaseUrl, useTestDb } from "./test-db";

const now = new Date("2026-11-04T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const signalRow = (
  source: string,
  feed: string | null,
  ingested: number,
  processed = 0,
  discarded = 0,
  prefiltered = 0,
): SignalCountRow => ({
  source,
  feed,
  ingested,
  processed,
  discarded,
  prefiltered,
});
const painRow = (source: string, feed: string | null, vertical: Vertical, n: number): PainCountRow => ({
  source,
  feed,
  vertical,
  pains: n,
});

describe("percent and window", () => {
  it("rounds and returns null without a total", () => {
    expect(percent(11, 18)).toBe(61);
    expect(percent(0, 5)).toBe(0);
    expect(percent(3, 0)).toBeNull();
  });

  it("uses a rolling window of exactly 30 × 24 hours", () => {
    expect(mixWindowStart(now)).toEqual(new Date("2026-10-05T12:00:00Z"));
  });
});

describe("sourceState", () => {
  it("maps the last run status, and is neutral without runs", () => {
    expect(sourceState(null)).toBe("unknown");
    expect(sourceState({ status: "ok" })).toBe("ok");
    expect(sourceState({ status: "skipped" })).toBe("not_configured");
    expect(sourceState({ status: "error" })).toBe("error");
  });
});

describe("buildSourceMix", () => {
  it("reproduces the first run's baseline: 100 % Hacker News and ~61 % devtools", () => {
    const mix = buildSourceMix({
      knownSources: ["hackernews", "reddit"],
      signalRows: [signalRow("hackernews", null, 500, 60, 43)],
      painRows: [painRow("hackernews", null, "devtools", 11), painRow("hackernews", null, "smb", 4), painRow("hackernews", null, "finance", 3)],
      lastRuns: [],
    });
    expect(mix).toMatchObject({ days: 30, ingested: 500, pains: 18 });
    const [hn, reddit] = mix.sources;
    expect(hn).toMatchObject({
      source: "hackernews",
      name: "Hacker News",
      state: "unknown",
      ingested: 500,
      processed: 60,
      discarded: 43,
      pains: 18,
      ingestedPercent: 100,
      devPercent: 61,
      feeds: [],
    });
    expect(hn.verticals).toEqual([
      { vertical: "devtools", pains: 11, percent: 61 },
      { vertical: "smb", pains: 4, percent: 22 },
      { vertical: "finance", pains: 3, percent: 17 },
    ]);
    // A known source with no data and no runs is still listed, neutrally.
    expect(reddit).toMatchObject({
      source: "reddit",
      state: "unknown",
      ingested: 0,
      pains: 0,
      ingestedPercent: 0,
      devPercent: null,
      verticals: [],
    });
  });

  it("shows a skipped source as not configured even with no posts", () => {
    const ranAt = daysAgo(1);
    const mix = buildSourceMix({
      knownSources: ["hackernews", "reddit"],
      signalRows: [],
      painRows: [],
      lastRuns: [
        { source: "reddit", status: "skipped", fetched: 0, inserted: 0, ranAt },
        { source: "hackernews", status: "ok", fetched: 10, inserted: 8, ranAt },
      ],
    });
    expect(mix.sources.map((s) => [s.source, s.state])).toEqual([
      ["hackernews", "ok"],
      ["reddit", "not_configured"],
    ]);
    expect(mix.sources[1].lastRun).toMatchObject({ status: "skipped", ranAt });
    expect(mix.sources[0].ingestedPercent).toBeNull();
  });

  it("breaks Reddit down by subreddit, busiest first, and sums them per source", () => {
    const mix = buildSourceMix({
      knownSources: ["hackernews", "reddit"],
      signalRows: [
        signalRow("hackernews", null, 30, 10, 6),
        signalRow("reddit", "SaaS", 5, 4, 2),
        signalRow("reddit", "smallbusiness", 15, 6, 3),
      ],
      painRows: [
        painRow("reddit", "SaaS", "devtools", 1),
        painRow("reddit", "SaaS", "smb", 1),
        painRow("reddit", "smallbusiness", "smb", 3),
        // Pains of a post ingested before the window still count for their subreddit.
        painRow("reddit", "freelance", "freelance", 2),
      ],
      lastRuns: [],
    });
    const reddit = mix.sources[1];
    expect(reddit).toMatchObject({ ingested: 20, processed: 10, discarded: 5, pains: 7, devPercent: 14, ingestedPercent: 40 });
    expect(reddit.verticals.map((v) => [v.vertical, v.pains])).toEqual([
      ["smb", 4],
      ["freelance", 2],
      ["devtools", 1],
    ]);
    expect(reddit.feeds.map((s) => [s.feed, s.ingested, s.processed, s.discarded, s.pains, s.devPercent])).toEqual([
      ["smallbusiness", 15, 6, 3, 3, 0],
      ["SaaS", 5, 4, 2, 2, 50],
      ["freelance", 0, 0, 0, 2, 0],
    ]);
    expect(mix.sources[0].ingestedPercent).toBe(60);
  });

  it("keeps the prefilter's discards apart from the analyst's, both within processed (H13)", () => {
    const mix = buildSourceMix({
      knownSources: ["hackernews"],
      signalRows: [signalRow("hackernews", null, 100, 40, 25, 3)],
      painRows: [],
      lastRuns: [],
    });
    expect(mix.sources[0]).toMatchObject({ ingested: 100, processed: 40, discarded: 25, prefiltered: 3 });
  });

  it("lists unknown sources with data or runs after the known ones, e.g. a future source", () => {
    const mix = buildSourceMix({
      knownSources: ["hackernews"],
      signalRows: [signalRow("stackexchange", null, 3)],
      painRows: [],
      lastRuns: [{ source: "another", status: "error", fetched: 0, inserted: 0, ranAt: now }],
    });
    expect(mix.sources.map((s) => [s.source, s.state])).toEqual([
      ["hackernews", "unknown"],
      ["another", "error"],
      ["stackexchange", "unknown"],
    ]);
  });
});

describe("activity filter", () => {
  it("parses a posts list with stage, source, subreddit and window", () => {
    expect(parseActivityFilter({ ver: "posts", source: "reddit", sub: "SaaS", estado: "discarded", days: "30" })).toEqual({
      list: "posts",
      source: "reddit",
      feed: "SaaS",
      stage: "discarded",
      days: 30,
    });
  });

  it("parses a pains list with vertical, and ignores what does not apply or is invalid", () => {
    expect(parseActivityFilter({ ver: "dolores", vertical: "devtools", estado: "discarded" })).toEqual({
      list: "pains",
      vertical: "devtools",
    });
    expect(
      parseActivityFilter({ ver: "posts", vertical: "devtools", source: "Robert'); drop", sub: "a/b", estado: "x", days: "-3" }),
    ).toEqual({ list: "posts" });
    expect(parseActivityFilter({ ver: "dolores", vertical: "nope", days: "1000" })).toEqual({ list: "pains" });
  });

  it("is null when no list is requested", () => {
    expect(parseActivityFilter({})).toBeNull();
    expect(parseActivityFilter({ ver: "other", source: "reddit" })).toBeNull();
  });

  it("parses the prefiltered stage (H13)", () => {
    expect(parseActivityFilter({ ver: "posts", source: "hackernews", estado: "prefiltered", days: "7" })).toEqual({
      list: "posts",
      source: "hackernews",
      stage: "prefiltered",
      days: 7,
    });
  });

  it("round-trips through the link", () => {
    const filters = [
      { list: "posts", source: "hackernews", stage: "prefiltered", days: 30 },
      { list: "posts", source: "reddit", feed: "SaaS", stage: "processed", days: 30 },
      { list: "pains", source: "stackexchange", feed: "money", vertical: "finance", days: 30 },
      { list: "pains", source: "hackernews", vertical: "devtools", days: 30 },
      { list: "posts", source: "hackernews", days: 30 },
    ] as const;
    for (const filter of filters) {
      const href = activityHref(filter);
      expect(href).toMatch(/^\/activity\?.*#lista$/);
      const params = Object.fromEntries(new URL(href, "http://x").searchParams);
      expect(parseActivityFilter(params)).toEqual(filter);
    }
    expect(activityHref({ list: "posts", stage: "ingested", source: "reddit", days: 30 })).toBe(
      "/activity?ver=posts&source=reddit&days=30#lista",
    );
  });

  it("describes the list in Spanish", () => {
    const label = (v: Vertical) => VERTICAL_LABELS[v];
    expect(describeActivityFilter({ list: "posts", source: "reddit", feed: "SaaS", stage: "discarded", days: 30 }, label)).toBe(
      "Posts de r/SaaS descartados por el analista (sin dolores) en los últimos 30 días",
    );
    expect(describeActivityFilter({ list: "posts", source: "hackernews", stage: "prefiltered", days: 7 }, label)).toBe(
      "Posts de Hacker News descartados por prefiltro en los últimos 7 días",
    );
    expect(describeActivityFilter({ list: "pains", source: "hackernews", vertical: "devtools", days: 30 }, label)).toBe(
      "Dolores de Hacker News en Herramientas para devs extraídos en los últimos 30 días",
    );
    expect(describeActivityFilter({ list: "pains", source: "stackexchange", feed: "money" }, label)).toBe(
      "Dolores de money (Stack Exchange) extraídos",
    );
    expect(describeActivityFilter({ list: "posts" }, label)).toBe("Posts ingresados");
  });
});

describe.skipIf(!testDatabaseUrl)("source mix (database)", () => {
  const db = useTestDb();

  async function seedSignal(
    externalId: string,
    {
      source = "hackernews",
      subreddit,
      site,
      fetchedAt,
      status = "pending",
      processedAt,
      prefilter,
    }: {
      source?: string;
      subreddit?: string;
      site?: string;
      fetchedAt: Date;
      status?: "pending" | "processed" | "discarded";
      processedAt?: Date;
      prefilter?: string;
    },
  ): Promise<number> {
    const [row] = await db
      .insert(signals)
      .values({
        source,
        externalId,
        url: `https://example.com/${externalId}`,
        body: "body",
        publishedAt: fetchedAt,
        fetchedAt,
        status,
        processedAt,
        metadata: {
          ...(subreddit ? { subreddit } : site ? { site } : {}),
          ...(prefilter ? { prefilter } : {}),
        },
      })
      .returning({ id: signals.id });
    return row.id;
  }

  async function seedPain(signalId: number, vertical: Vertical, createdAt: Date) {
    await db.insert(pains).values({
      signalId,
      description: "d",
      persona: "p",
      quote: "q",
      vertical,
      intensity: "medium",
      willingnessToPay: "none",
      model: "test",
      createdAt,
    });
  }

  async function seed() {
    const hn1 = await seedSignal("hn-1", { fetchedAt: daysAgo(2), status: "processed", processedAt: daysAgo(1) });
    await seedSignal("hn-2", { fetchedAt: daysAgo(3), status: "discarded", processedAt: daysAgo(1) });
    await seedSignal("hn-3", { fetchedAt: daysAgo(1) });
    // Ingested before the window, processed within it.
    const hnOld = await seedSignal("hn-old", { fetchedAt: daysAgo(40), status: "processed", processedAt: daysAgo(5) });
    // Entirely outside the window.
    const hnAncient = await seedSignal("hn-ancient", { fetchedAt: daysAgo(60), status: "processed", processedAt: daysAgo(50) });
    const saas = await seedSignal("rd-1", { source: "reddit", subreddit: "SaaS", fetchedAt: daysAgo(2), status: "processed", processedAt: daysAgo(1) });
    await seedSignal("rd-2", { source: "reddit", subreddit: "smallbusiness", fetchedAt: daysAgo(2), status: "discarded", processedAt: daysAgo(1) });

    await seedPain(hn1, "devtools", daysAgo(1));
    await seedPain(hn1, "devtools", daysAgo(1));
    await seedPain(hnOld, "smb", daysAgo(5));
    await seedPain(hnAncient, "devtools", daysAgo(50));
    await seedPain(saas, "smb", daysAgo(1));
    return { hn1, saas };
  }

  it("counts posts and pains per source and subreddit within the last 30 days", async () => {
    await seed();
    await db.insert(ingestRuns).values([
      { source: "reddit", status: "ok", fetched: 2, inserted: 2, ranAt: daysAgo(3) },
      { source: "reddit", status: "skipped", ranAt: daysAgo(1) },
      { source: "hackernews", status: "ok", fetched: 3, inserted: 3, ranAt: daysAgo(1) },
    ]);

    const mix = await getSourceMix(db, ["hackernews", "reddit"], now);
    const [hn, reddit] = mix.sources;
    expect(hn).toMatchObject({ state: "ok", ingested: 3, processed: 3, discarded: 1, pains: 3, devPercent: 67, ingestedPercent: 60 });
    expect(hn.lastRun).toMatchObject({ status: "ok", inserted: 3 });
    expect(reddit).toMatchObject({ state: "not_configured", ingested: 2, processed: 2, discarded: 1, pains: 1, devPercent: 0 });
    expect(reddit.feeds.map((s) => [s.feed, s.ingested, s.processed, s.discarded, s.pains])).toEqual([
      ["SaaS", 1, 1, 0, 1],
      ["smallbusiness", 1, 1, 1, 0],
    ]);
  });

  it("breaks Stack Exchange down by site, and lists the posts and pains of one site", async () => {
    const money = await seedSignal("money:1", { source: "stackexchange", site: "money", fetchedAt: daysAgo(2), status: "processed", processedAt: daysAgo(1) });
    await seedSignal("money:2", { source: "stackexchange", site: "money", fetchedAt: daysAgo(2) });
    await seedSignal("softwarerecs:1", { source: "stackexchange", site: "softwarerecs", fetchedAt: daysAgo(3), status: "discarded", processedAt: daysAgo(1) });
    await seedPain(money, "finance", daysAgo(1));

    const mix = await getSourceMix(db, ["hackernews", "reddit", "stackexchange"], now);
    const se = mix.sources[2];
    expect(se).toMatchObject({ source: "stackexchange", name: "Stack Exchange", ingested: 3, processed: 2, discarded: 1, pains: 1 });
    expect(se.feeds.map((f) => [f.feed, f.ingested, f.processed, f.discarded, f.pains])).toEqual([
      ["money", 2, 1, 0, 1],
      ["softwarerecs", 1, 1, 1, 0],
    ]);

    const posts = await getFilteredSignals(db, { list: "posts", source: "stackexchange", feed: "money", days: 30 }, now);
    expect(posts.map((p) => p.externalId).sort()).toEqual(["money:1", "money:2"]);
    const sitePains = await getFilteredPains(db, { list: "pains", source: "stackexchange", feed: "money", days: 30 }, now);
    expect(sitePains.map((p) => p.signalId)).toEqual([money]);
  });

  it("returns the latest run of each source", async () => {
    await db.insert(ingestRuns).values([
      { source: "reddit", status: "skipped", ranAt: daysAgo(1) },
      { source: "reddit", status: "error", ranAt: daysAgo(2) },
      { source: "hackernews", status: "ok", fetched: 1, inserted: 1, ranAt: daysAgo(4) },
    ]);
    const runs = await getLastIngestRuns(db);
    expect(runs.map((r) => [r.source, r.status, r.ranAt])).toEqual([
      ["hackernews", "ok", daysAgo(4)],
      ["reddit", "skipped", daysAgo(1)],
    ]);
  });

  it("lists exactly the posts behind each count", async () => {
    await seed();
    const ids = async (filter: Parameters<typeof getFilteredSignals>[1]) =>
      (await getFilteredSignals(db, filter, now)).map((s) => s.externalId).sort();

    expect(await ids({ list: "posts", source: "hackernews", days: 30 })).toEqual(["hn-1", "hn-2", "hn-3"]);
    expect(await ids({ list: "posts", source: "hackernews", stage: "processed", days: 30 })).toEqual(["hn-1", "hn-2", "hn-old"]);
    expect(await ids({ list: "posts", source: "hackernews", stage: "discarded", days: 30 })).toEqual(["hn-2"]);
    expect(await ids({ list: "posts", source: "reddit", feed: "SaaS", days: 30 })).toEqual(["rd-1"]);
    expect(await ids({ list: "posts", source: "hackernews" })).toHaveLength(5);
  });

  it("separates the prefilter's discards from the analyst's in counts and lists (H13)", async () => {
    await seed();
    await seedSignal("hn-monthly", { fetchedAt: daysAgo(2), status: "discarded", processedAt: daysAgo(1), prefilter: "hn-monthly-thread" });
    await seedSignal("hn-monthly-old", { fetchedAt: daysAgo(60), status: "discarded", processedAt: daysAgo(45), prefilter: "hn-monthly-thread" });

    const [hn] = (await getSourceMix(db, ["hackernews"], now)).sources;
    expect(hn).toMatchObject({ ingested: 4, processed: 4, discarded: 1, prefiltered: 1 });

    const ids = async (filter: Parameters<typeof getFilteredSignals>[1]) =>
      (await getFilteredSignals(db, filter, now)).map((s) => s.externalId).sort();
    expect(await ids({ list: "posts", source: "hackernews", stage: "prefiltered", days: 30 })).toEqual(["hn-monthly"]);
    expect(await ids({ list: "posts", source: "hackernews", stage: "prefiltered" })).toEqual(["hn-monthly", "hn-monthly-old"]);
    expect(await ids({ list: "posts", source: "hackernews", stage: "discarded", days: 30 })).toEqual(["hn-2"]);
    expect(await ids({ list: "posts", source: "hackernews", stage: "processed", days: 30 })).toEqual(["hn-1", "hn-2", "hn-monthly", "hn-old"]);
  });

  it("lists exactly the pains behind each count, with their post link", async () => {
    const { hn1, saas } = await seed();
    const devtools = await getFilteredPains(db, { list: "pains", source: "hackernews", vertical: "devtools", days: 30 }, now);
    expect(devtools.map((p) => p.signalId)).toEqual([hn1, hn1]);
    expect(devtools[0].url).toBe("https://example.com/hn-1");

    const sub = await getFilteredPains(db, { list: "pains", source: "reddit", feed: "SaaS", days: 30 }, now);
    expect(sub.map((p) => [p.signalId, p.vertical, p.source])).toEqual([[saas, "smb", "reddit"]]);
    expect(await getFilteredPains(db, { list: "pains", source: "hackernews", days: 30 }, now)).toHaveLength(3);
  });
});
