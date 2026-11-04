import { describe, expect, it } from "vitest";
import {
  commentCount,
  compareByActivity,
  keepMostActive,
  orderDueOpportunities,
  planExtraction,
  pointCount,
  splitEqually,
  type DueOpportunity,
  type PendingPost,
} from "./work-order";

const now = new Date("2026-11-04T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const opts = { now, maxPendingDays: 14 };

let nextId = 1;
function post(source: string, overrides: Partial<PendingPost> = {}): PendingPost {
  return { id: nextId++, source, publishedAt: daysAgo(2), fetchedAt: daysAgo(1), metadata: {}, ...overrides };
}
const ids = (items: { id: number }[]) => items.map((i) => i.id);
const many = (n: number, source: string, overrides: Partial<PendingPost> = {}) =>
  Array.from({ length: n }, () => post(source, overrides));

describe("activity metrics", () => {
  it("reads comments from numComments, falling back to answerCount", () => {
    expect(commentCount({ numComments: 7, answerCount: 2 })).toBe(7);
    expect(commentCount({ answerCount: 2 })).toBe(2);
    expect(commentCount({ numComments: "9" })).toBe(0);
    expect(commentCount(null)).toBe(0);
  });

  it("reads points from points, falling back to score", () => {
    expect(pointCount({ points: 3, score: 50 })).toBe(3);
    expect(pointCount({ score: 50 })).toBe(50);
    expect(pointCount({})).toBe(0);
  });
});

describe("compareByActivity", () => {
  it("orders by comments, then points, then most recent, then id", () => {
    const a = post("hn", { metadata: { numComments: 1, points: 100 } });
    const b = post("hn", { metadata: { numComments: 5, points: 0 } });
    const c = post("hn", { metadata: { numComments: 1, points: 200 } });
    const d = post("hn", { metadata: { numComments: 1, points: 100 }, publishedAt: daysAgo(1) });
    const e = post("hn", { metadata: { numComments: 1, points: 100 } });
    expect(ids([a, b, c, d, e].sort(compareByActivity))).toEqual(ids([b, c, d, a, e]));
  });

  it("orders a source without metrics by date only", () => {
    const old = post("x", { publishedAt: daysAgo(5) });
    const recent = post("x", { publishedAt: daysAgo(1) });
    expect(ids([old, recent].sort(compareByActivity))).toEqual(ids([recent, old]));
  });
});

describe("keepMostActive", () => {
  const item = (name: string, numComments: number, day: number) => ({ name, publishedAt: daysAgo(day), metadata: { numComments } });

  it("keeps everything under the cap, in the original order", () => {
    const items = [item("a", 0, 1), item("b", 9, 1)];
    expect(keepMostActive(items, 2)).toBe(items);
  });

  it("keeps the most commented and, on ties, the most recent", () => {
    const items = [item("quiet", 0, 1), item("old", 3, 5), item("busy", 9, 2), item("new", 3, 1)];
    expect(keepMostActive(items, 3).map((i) => i.name)).toEqual(["busy", "new", "old"]);
  });
});

describe("splitEqually", () => {
  const split = (sizes: Record<string, number>, limit: number) => Object.fromEntries(splitEqually(new Map(Object.entries(sizes)), limit));

  it("splits the batch in equal parts", () => {
    expect(split({ a: 50, b: 50 }, 30)).toEqual({ a: 15, b: 15 });
  });

  it("gives the remainder to the first sources", () => {
    expect(split({ a: 50, b: 50, c: 50 }, 10)).toEqual({ a: 4, b: 3, c: 3 });
  });

  it("redistributes what a small source does not use", () => {
    expect(split({ a: 440, b: 4, c: 10 }, 30)).toEqual({ a: 16, b: 4, c: 10 });
    expect(split({ a: 440, b: 4, c: 12 }, 30)).toEqual({ a: 14, b: 4, c: 12 });
  });

  it("never exceeds what is pending", () => {
    expect(split({ a: 3, b: 2 }, 30)).toEqual({ a: 3, b: 2 });
    expect(split({ a: 0, b: 5 }, 4)).toEqual({ a: 0, b: 4 });
    expect(split({}, 10)).toEqual({});
    expect(split({ a: 5 }, 0)).toEqual({ a: 0 });
  });
});

describe("planExtraction", () => {
  it("returns nothing when there are no pending posts", () => {
    expect(planExtraction([], 30, opts)).toEqual([]);
  });

  it("with a single source, hands out its most active posts", () => {
    const quiet = post("hn", { metadata: { numComments: 0, points: 1 } });
    const busy = post("hn", { metadata: { numComments: 40, points: 3 } });
    const liked = post("hn", { metadata: { numComments: 0, points: 90 } });
    expect(ids(planExtraction([quiet, busy, liked], 2, opts))).toEqual(ids([busy, liked]));
  });

  it("includes every source with pending posts, however big or old the other one is", () => {
    const hn = many(440, "hackernews", { publishedAt: daysAgo(30), fetchedAt: daysAgo(3), metadata: { numComments: 100 } });
    const reddit = many(20, "reddit", { metadata: { numComments: 0 } });
    const batch = planExtraction([...hn, ...reddit], 30, opts);
    expect(batch).toHaveLength(30);
    expect(batch.filter((p) => p.source === "hackernews")).toHaveLength(15);
    expect(batch.filter((p) => p.source === "reddit")).toHaveLength(15);
  });

  it("gives the share a small source cannot use to the others", () => {
    const hn = many(100, "hackernews");
    const reddit = many(4, "reddit");
    const batch = planExtraction([...hn, ...reddit], 30, opts);
    expect(batch.filter((p) => p.source === "reddit")).toHaveLength(4);
    expect(batch.filter((p) => p.source === "hackernews")).toHaveLength(26);
  });

  it("interleaves the sources in the batch", () => {
    const batch = planExtraction([...many(3, "reddit"), ...many(3, "hackernews")], 4, opts);
    expect(batch.map((p) => p.source)).toEqual(["hackernews", "reddit", "hackernews", "reddit"]);
  });

  it("lets aged posts take up to half of their source's share, oldest first", () => {
    const aged = [20, 16, 30, 15].map((days) => post("hn", { fetchedAt: daysAgo(days), metadata: { numComments: 0 } }));
    const active = many(10, "hn", { metadata: { numComments: 50 } });
    const batch = planExtraction([...active, ...aged], 4, opts);
    // Half of 4 for the two oldest aged posts, the other half for the most active.
    expect(ids(batch.slice(0, 2))).toEqual(ids([aged[2], aged[0]]));
    expect(ids(batch.slice(2))).toEqual(ids(active.slice(0, 2)));
  });

  it("rounds the aged half up, so a share of one still drains them", () => {
    const aged = post("hn", { fetchedAt: daysAgo(20) });
    const active = post("hn", { metadata: { numComments: 50 } });
    expect(ids(planExtraction([active, aged], 1, opts))).toEqual([aged.id]);
    expect(ids(planExtraction([active, aged], 3, opts))).toEqual([aged.id, active.id]);
  });

  it("does not treat posts exactly N days old or newer as aged", () => {
    const edge = post("hn", { fetchedAt: daysAgo(14), metadata: { numComments: 0 } });
    const active = post("hn", { metadata: { numComments: 50 } });
    expect(ids(planExtraction([edge, active], 1, opts))).toEqual([active.id]);
  });

  it("lets aged posts beyond the half compete on activity", () => {
    const agedQuiet = post("hn", { fetchedAt: daysAgo(30), metadata: { numComments: 0 } });
    const agedBusy = post("hn", { fetchedAt: daysAgo(20), metadata: { numComments: 99 } });
    const fresh = post("hn", { metadata: { numComments: 10 } });
    expect(ids(planExtraction([fresh, agedBusy, agedQuiet], 2, opts))).toEqual([agedQuiet.id, agedBusy.id]);
  });
});

describe("orderDueOpportunities", () => {
  function opp(overrides: Partial<DueOpportunity>): DueOpportunity {
    return { id: nextId++, createdAt: daysAgo(1), assessedAt: null, authorCount: 1, partialScore: 5, ...overrides };
  }

  it("puts more distinct authors first, then the higher partial score", () => {
    const few = opp({ authorCount: 1, partialScore: 9 });
    const many = opp({ authorCount: 4, partialScore: 2 });
    const tieLow = opp({ authorCount: 2, partialScore: 3 });
    const tieHigh = opp({ authorCount: 2, partialScore: 7 });
    expect(ids(orderDueOpportunities([few, many, tieLow, tieHigh], opts))).toEqual(ids([many, tieHigh, tieLow, few]));
  });

  it("puts never-assessed ones waiting more than N days first, oldest first", () => {
    const strong = opp({ authorCount: 9 });
    const aged = opp({ authorCount: 1, createdAt: daysAgo(15) });
    const older = opp({ authorCount: 1, createdAt: daysAgo(40) });
    expect(ids(orderDueOpportunities([strong, aged, older], opts))).toEqual(ids([older, aged, strong]));
  });

  it("leaves re-assessments for last, oldest assessment first", () => {
    const stale = opp({ authorCount: 9, createdAt: daysAgo(90), assessedAt: daysAgo(31) });
    const staler = opp({ authorCount: 1, createdAt: daysAgo(90), assessedAt: daysAgo(60) });
    const fresh = opp({ authorCount: 1 });
    expect(ids(orderDueOpportunities([stale, staler, fresh], opts))).toEqual(ids([fresh, staler, stale]));
  });
});
