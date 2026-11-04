import { describe, expect, it, vi } from "vitest";
import { quoteAppearsIn } from "../text";
import money from "./__fixtures__/se-questions-money.json";
import {
  createStackExchangeAdapter,
  createStackExchangeAdapterFromEnv,
  DEFAULT_SITES,
  parseExternalId,
  parseSites,
  selectForFeed,
  StackExchangeThrottleError,
} from "./stackexchange";
import { SourceNotConfiguredError, type FeedFetchReport } from "./types";

const NOW = new Date("2026-11-04T12:00:00Z");
const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

type Handler = (url: URL) => { status?: number; body: unknown };

/** A fake API: records every request and answers with `handler`. */
function fakeApi(handler: Handler) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(new Headers(init?.headers).get("accept-encoding")).toBeNull();
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fetchImpl, calls };
}

const wrapper = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  has_more: false,
  quota_max: 10000,
  quota_remaining: 9000,
  ...extra,
});

function question(id: number, overrides: Record<string, unknown> = {}) {
  return {
    question_id: id,
    title: `Question ${id}`,
    body: `<p>Body ${id}</p>`,
    link: `https://money.stackexchange.com/questions/${id}/q`,
    score: 0,
    answer_count: 0,
    view_count: 10,
    tags: [],
    owner: { user_type: "registered", display_name: "someone", link: "https://money.stackexchange.com/users/1/someone" },
    creation_date: unix("2026-11-01T00:00:00Z"),
    is_answered: false,
    content_license: "CC BY-SA 4.0",
    ...overrides,
  };
}

const adapterFor = (fetchImpl: typeof fetch, options: Partial<Parameters<typeof createStackExchangeAdapter>[0]> = {}) =>
  createStackExchangeAdapter({
    key: "test-key",
    sites: ["money"],
    fetchImpl,
    sleep: async () => {},
    now: () => NOW,
    ...options,
  });

describe("stackexchange adapter: fetching", () => {
  it("asks each site for questions older than 24 h with the key, the body filter and creation order", async () => {
    const { fetchImpl, calls } = fakeApi(() => ({ body: wrapper([]) }));
    const since = new Date("2026-11-01T00:00:00Z");

    await adapterFor(fetchImpl, { sites: ["softwarerecs", "money"] }).fetchSignals({ since });

    expect(calls.map((u) => u.searchParams.get("site"))).toEqual(["softwarerecs", "money"]);
    const url = calls[0];
    expect(url.origin + url.pathname).toBe("https://api.stackexchange.com/2.3/questions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      site: "softwarerecs",
      sort: "creation",
      order: "desc",
      fromdate: String(unix("2026-11-01T00:00:00Z")),
      todate: String(unix("2026-11-03T12:00:00Z")),
      pagesize: "100",
      page: "1",
      filter: "withbody",
      key: "test-key",
    });
  });

  it("reaches 8 days back on the first run and honors a custom minimum age", async () => {
    const { fetchImpl, calls } = fakeApi(() => ({ body: wrapper([]) }));
    await adapterFor(fetchImpl).fetchSignals();
    expect(calls[0].searchParams.get("fromdate")).toBe(String(unix("2026-10-27T12:00:00Z")));
    expect(calls[0].searchParams.get("todate")).toBe(String(unix("2026-11-03T12:00:00Z")));

    const custom = fakeApi(() => ({ body: wrapper([]) }));
    await adapterFor(custom.fetchImpl, { minAgeHours: 48 }).fetchSignals();
    expect(custom.calls[0].searchParams.get("todate")).toBe(String(unix("2026-11-02T12:00:00Z")));
  });

  it("normalizes a question into a plain-text signal with everything the attribution needs", async () => {
    const { fetchImpl } = fakeApi(() => ({ body: money }));

    const signals = await adapterFor(fetchImpl).fetchSignals();

    const bills = signals.find((s) => s.externalId === "money:170001")!;
    expect(bills).toMatchObject({
      url: "https://money.stackexchange.com/questions/170001/how-can-i-split-shared-household-bills-without-a-spreadsheet",
      title: `How can I split shared household bills & keep track of who's paid without a "spreadsheet"?`,
      author: 'Ana "budget" López',
      publishedAt: new Date(1792540800 * 1000),
      metadata: {
        site: "money",
        score: 7,
        answerCount: 3,
        viewCount: 812,
        tags: ["budgeting", "software", "spreadsheet"],
        hasAcceptedAnswer: true,
        closed: false,
        closedReason: null,
        ownerLink: "https://money.stackexchange.com/users/4242/ana-budget-lopez",
        license: "CC BY-SA 4.0",
      },
    });
    // No tags, entities or link targets left ("<" in the code sample is text).
    expect(bills.body).not.toMatch(/<\/?[a-z]|&#|&quot;|&amp;|&lt;|https?:/i);
    expect(bills.body).toContain("What I need:\n\n- Import transactions from two different banks\n- Split each bill");
    expect(bills.body).toContain("Right now I keep a Google Sheet but it's a mess every month.");
    expect(bills.body).toContain("- Import transactions from two different banks");
    expect(bills.body).toContain('=SUMIF(B:B, "rent", C:C) * 0.6 < 1000');
  });

  it("produces text where quotes copied from formatted questions pass the verbatim check", async () => {
    const { fetchImpl } = fakeApi(() => ({ body: money }));
    const [bills] = await adapterFor(fetchImpl).fetchSignals();

    for (const quote of [
      "I keep a Google Sheet but it's a mess every month",
      "Split each bill by a custom percentage (60/40)",
      "I tried Splitwise but it can't import from my bank.",
      "I'd happily pay $5/month for something that just works.",
      "keep track of who's paid without a \"spreadsheet\"",
    ]) {
      expect(quoteAppearsIn(quote, bills), quote).toBe(true);
    }
  });

  it("keeps closed and answered questions, drops negative scores and keeps a deleted user's name without link", async () => {
    const { fetchImpl } = fakeApi(() => ({ body: money }));
    const reports: FeedFetchReport[] = [];

    const signals = await adapterFor(fetchImpl).fetchSignals({ onFeed: (r) => reports.push(r) });

    expect(signals.map((s) => s.externalId)).toEqual(["money:170001", "money:170010"]);
    expect(signals[1]).toMatchObject({
      author: "user98765",
      metadata: { closed: true, closedReason: "Duplicate", hasAcceptedAnswer: false, ownerLink: null },
    });
    expect(reports).toEqual([{ feed: "money", fetched: 3, filtered: 1, capped: 0 }]);
  });

  it("caps each site, keeping the most answered, then the best scored, then the newest", async () => {
    const items = [
      question(1, { answer_count: 0, score: 9 }),
      question(2, { answer_count: 2, score: 0 }),
      question(3, { answer_count: 2, score: 5 }),
      question(4, { answer_count: 0, score: 9, creation_date: unix("2026-11-02T00:00:00Z") }),
      question(5, { answer_count: 0, score: 1 }),
    ];
    const { fetchImpl } = fakeApi(() => ({ body: wrapper(items) }));
    const reports: FeedFetchReport[] = [];

    const signals = await adapterFor(fetchImpl, { maxNewPerFeed: 3 }).fetchSignals({ onFeed: (r) => reports.push(r) });

    expect(signals.map((s) => s.externalId)).toEqual(["money:3", "money:2", "money:4"]);
    expect(reports).toEqual([{ feed: "money", fetched: 5, filtered: 0, capped: 2 }]);
  });

  it("reads at most two pages per site and stops when has_more is false", async () => {
    const twoPages = fakeApi((url) => ({
      body: wrapper([question(Number(url.searchParams.get("page")))], { has_more: true }),
    }));
    expect(await adapterFor(twoPages.fetchImpl).fetchSignals()).toHaveLength(2);
    expect(twoPages.calls.map((u) => u.searchParams.get("page"))).toEqual(["1", "2"]);

    const onePage = fakeApi(() => ({ body: wrapper([question(1)]) }));
    await adapterFor(onePage.fetchImpl).fetchSignals();
    expect(onePage.calls).toHaveLength(1);
  });

  it("ignores questions at or before the cut, since fromdate includes its own second", async () => {
    const since = new Date("2026-11-01T00:00:00Z");
    const { fetchImpl } = fakeApi(() => ({
      body: wrapper([question(1, { creation_date: unix("2026-11-01T00:00:00Z") }), question(2, { creation_date: unix("2026-11-01T00:00:01Z") })]),
    }));
    const signals = await adapterFor(fetchImpl).fetchSignals({ since });
    expect(signals.map((s) => s.externalId)).toEqual(["money:2"]);
  });

  it("uses the title as body when the question has no text", async () => {
    const { fetchImpl } = fakeApi(() => ({ body: wrapper([question(1, { body: "<p><img src='x.png'></p>" })]) }));
    const [signal] = await adapterFor(fetchImpl).fetchSignals();
    expect(signal.body).toBe("Question 1");
  });
});

describe("stackexchange adapter: throttling", () => {
  it("waits the backoff before the next request", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const { fetchImpl } = fakeApi(() => ({ body: wrapper([], n++ === 0 ? { backoff: 10 } : {}) }));

    await adapterFor(fetchImpl, { sites: ["money", "workplace"], sleep }).fetchSignals();

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it("stops the source when the backoff is over 60 s, the quota runs low or the API throttles", async () => {
    const longBackoff = fakeApi(() => ({ body: wrapper([], { backoff: 120 }) }));
    await expect(adapterFor(longBackoff.fetchImpl).fetchSignals()).rejects.toThrow(/backoff too long/);

    const lowQuota = fakeApi(() => ({ body: wrapper([], { quota_remaining: 99 }) }));
    await expect(adapterFor(lowQuota.fetchImpl).fetchSignals()).rejects.toThrow(StackExchangeThrottleError);

    const throttled = fakeApi(() => ({
      status: 400,
      body: { error_id: 502, error_name: "throttle_violation", error_message: "too many requests from this IP, more requests available in 30 seconds" },
    }));
    const adapter = adapterFor(throttled.fetchImpl, { sites: ["money", "workplace"] });
    await expect(adapter.fetchSignals()).rejects.toThrow(/throttle_violation/);
    // No retry loop, and the next site is not tried either.
    expect(throttled.calls).toHaveLength(1);
  });

  it("reports API errors with their name and site, so a wrong site or key is easy to spot", async () => {
    const { fetchImpl } = fakeApi(() => ({
      status: 400,
      body: { error_id: 400, error_name: "bad_parameter", error_message: "No site found for name `personalfinance`" },
    }));
    await expect(adapterFor(fetchImpl, { sites: ["personalfinance"] }).fetchSignals()).rejects.toThrow(
      "Stack Exchange API error bad_parameter: No site found for name `personalfinance` (site personalfinance)",
    );
  });

  it("fails the whole source when one site fails, so nothing is stored half-way", async () => {
    const { fetchImpl } = fakeApi((url) =>
      url.searchParams.get("site") === "workplace" ? { status: 500, body: { error_id: 500, error_name: "internal_error", error_message: "x" } } : { body: wrapper([question(1)]) },
    );
    await expect(adapterFor(fetchImpl, { sites: ["money", "workplace"] }).fetchSignals()).rejects.toThrow(/internal_error/);
  });
});

describe("stackexchange adapter: deletion check", () => {
  it("looks stored questions up again by id per site and returns the ones that did not come back", async () => {
    const { fetchImpl, calls } = fakeApi((url) => {
      const ids = url.pathname.split("/").pop()!.split(";").map(Number);
      // Question 2 of money was deleted.
      return { body: wrapper(ids.filter((id) => !(url.searchParams.get("site") === "money" && id === 2)).map((id) => ({ question_id: id }))) };
    });

    const result = await adapterFor(fetchImpl).reconcile!([
      { externalId: "money:1" },
      { externalId: "money:2" },
      { externalId: "workplace:2" },
      { externalId: "malformed" },
    ]);

    expect(result).toEqual({ missing: ["money:2"] });
    expect(calls.map((u) => [u.pathname, u.searchParams.get("site"), u.searchParams.get("pagesize"), u.searchParams.get("key")])).toEqual([
      ["/2.3/questions/1;2", "money", "100", "test-key"],
      ["/2.3/questions/2", "workplace", "100", "test-key"],
    ]);
  });

  it("asks for at most 100 ids per request", async () => {
    const { fetchImpl, calls } = fakeApi((url) => ({
      body: wrapper(url.pathname.split("/").pop()!.split(";").map((id) => ({ question_id: Number(id) }))),
    }));
    const stored = Array.from({ length: 150 }, (_, i) => ({ externalId: `money:${i + 1}` }));

    expect(await adapterFor(fetchImpl).reconcile!(stored)).toEqual({ missing: [] });
    expect(calls.map((u) => u.pathname.split("/").pop()!.split(";").length)).toEqual([100, 50]);
  });

  it("stops on throttling like the fetch does", async () => {
    const { fetchImpl } = fakeApi(() => ({ status: 400, body: { error_id: 502, error_name: "throttle_violation", error_message: "slow down" } }));
    await expect(adapterFor(fetchImpl).reconcile!([{ externalId: "money:1" }])).rejects.toThrow(StackExchangeThrottleError);
  });
});

describe("selectForFeed and parseExternalId", () => {
  it("orders by answers, score and recency without mutating the input", () => {
    const input = [
      { answer_count: 0, score: 1, creation_date: 1 },
      { answer_count: null, score: 3, creation_date: 2 },
      { answer_count: 0, score: 3, creation_date: 3 },
    ];
    expect(selectForFeed(input, 2)).toEqual([input[2], input[1]]);
    expect(input[0].creation_date).toBe(1);
  });

  it("splits the site prefix from the question id", () => {
    expect(parseExternalId("money:123")).toEqual({ site: "money", questionId: 123 });
    expect(parseExternalId("pt.stackoverflow:9")).toEqual({ site: "pt.stackoverflow", questionId: 9 });
    expect(parseExternalId("t3_abc")).toBeNull();
  });
});

describe("createStackExchangeAdapterFromEnv", () => {
  it("is not configured without STACKEXCHANGE_KEY", () => {
    expect(() => createStackExchangeAdapterFromEnv({})).toThrow(SourceNotConfiguredError);
    expect(() => createStackExchangeAdapterFromEnv({ STACKEXCHANGE_KEY: "  " })).toThrow(/STACKEXCHANGE_KEY/);
  });

  it("builds the adapter with the key", () => {
    const adapter = createStackExchangeAdapterFromEnv({ STACKEXCHANGE_KEY: "k" });
    expect(adapter.id).toBe("stackexchange");
    expect(adapter.reconcile).toBeTypeOf("function");
    expect(adapter.reconcileDays).toBe(30);
  });

  it("defaults to ADR-0010's sites and parses SEEDBOX_SE_SITES", () => {
    expect(DEFAULT_SITES).toEqual(["softwarerecs", "webapps", "money", "workplace", "academia", "freelancing", "expatriates", "parenting"]);
    expect(parseSites(undefined)).toEqual(DEFAULT_SITES);
    expect(parseSites(" , ")).toEqual(DEFAULT_SITES);
    expect(parseSites("money, workplace,money")).toEqual(["money", "workplace"]);
  });

  it("reads the per-feed cap and minimum age with ADR-0009's defaults", async () => {
    const run = async (env: Record<string, string>) => {
      const { fetchImpl, calls } = fakeApi(() => ({
        body: wrapper(Array.from({ length: 30 }, (_, i) => question(i + 1))),
      }));
      vi.stubGlobal("fetch", fetchImpl);
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      try {
        const adapter = createStackExchangeAdapterFromEnv({ STACKEXCHANGE_KEY: "k", SEEDBOX_SE_SITES: "money", ...env });
        const signals = await adapter.fetchSignals();
        return { count: signals.length, todate: calls[0].searchParams.get("todate") };
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    };
    expect(await run({})).toEqual({ count: 25, todate: String(unix("2026-11-03T12:00:00Z")) });
    expect(await run({ SEEDBOX_MAX_NEW_PER_FEED: "10", SEEDBOX_INGEST_MIN_AGE_HOURS: "12" })).toEqual({
      count: 10,
      todate: String(unix("2026-11-04T00:00:00Z")),
    });
    expect(await run({ SEEDBOX_MAX_NEW_PER_FEED: "abc", SEEDBOX_INGEST_MIN_AGE_HOURS: "-1" })).toMatchObject({ count: 25 });
  });
});
