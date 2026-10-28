import { describe, expect, it, vi } from "vitest";
import { createRedditAdapter, createRedditAdapterFromEnv, DEFAULT_SUBREDDITS, isUsefulPost } from "./reddit";

const T = (iso: string) => Date.parse(iso) / 1000;

function post(overrides: Record<string, unknown>) {
  return {
    name: "t3_default",
    title: "Title",
    selftext: "Body",
    author: "someone",
    created_utc: T("2026-10-20T10:00:00Z"),
    permalink: "/r/smallbusiness/comments/default/title/",
    subreddit: "smallbusiness",
    score: 10,
    num_comments: 4,
    is_self: true,
    stickied: false,
    over_18: false,
    removed_by_category: null,
    ...overrides,
  };
}

const listing = (posts: unknown[], after: string | null = null) => ({
  kind: "Listing",
  data: { after, children: posts.map((data) => ({ kind: "t3", data })) },
});

const invoicing = post({
  name: "t3_abc",
  title: "How do you chase late invoices?",
  selftext: "I spend every Friday chasing clients & it kills me.",
  author: "owner42",
  created_utc: T("2026-10-20T12:00:00Z"),
  permalink: "/r/smallbusiness/comments/abc/how_do_you_chase/",
  score: 57,
  num_comments: 23,
});

/** Routes token and listing requests; `pages` maps "subreddit:after" to a listing. */
function fakeReddit(pages: Record<string, unknown>, { tokenStatus = 200 } = {}) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/api/v1/access_token") {
      return new Response(JSON.stringify({ access_token: "tok", token_type: "bearer", expires_in: 86400 }), { status: tokenStatus });
    }
    const subreddit = url.pathname.split("/")[2];
    const key = `${subreddit}:${url.searchParams.get("after") ?? ""}`;
    const page = pages[key];
    return page ? new Response(JSON.stringify(page)) : new Response("not found", { status: 404 });
  });
  return { fetchImpl, calls };
}

const credentials = { clientId: "id", clientSecret: "secret", userAgent: "seedbox-test/0.1" };

describe("isUsefulPost", () => {
  it("keeps self posts with text", () => {
    expect(isUsefulPost(post({}))).toBe(true);
  });

  it.each([
    ["stickied", { stickied: true }],
    ["link posts", { is_self: false }],
    ["NSFW", { over_18: true }],
    ["removed by moderators", { removed_by_category: "moderator" }],
    ["removed body", { selftext: "[removed]" }],
    ["deleted body", { selftext: "[deleted]" }],
    ["AutoModerator", { author: "AutoModerator" }],
    ["deleted author", { author: "[deleted]" }],
  ])("drops %s", (_, overrides) => {
    expect(isUsefulPost(post(overrides))).toBe(false);
  });
});

describe("reddit adapter", () => {
  it("authenticates once and normalizes posts", async () => {
    const { fetchImpl, calls } = fakeReddit({
      "smallbusiness:": listing([invoicing]),
      "freelance:": listing([post({ name: "t3_def", subreddit: "freelance", selftext: "" })]),
    });
    const adapter = createRedditAdapter({ ...credentials, subreddits: ["smallbusiness", "freelance"], fetchImpl });

    const signals = await adapter.fetchSignals();

    const tokenCalls = calls.filter((c) => c.url.pathname === "/api/v1/access_token");
    expect(tokenCalls).toHaveLength(1);
    const tokenHeaders = tokenCalls[0].init?.headers as Record<string, string>;
    expect(tokenHeaders.Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(tokenCalls[0].init?.body).toBe("grant_type=client_credentials");

    const listingCall = calls.find((c) => c.url.hostname === "oauth.reddit.com")!;
    expect((listingCall.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect((listingCall.init?.headers as Record<string, string>)["User-Agent"]).toBe("seedbox-test/0.1");
    expect(listingCall.url.searchParams.get("raw_json")).toBe("1");

    expect(signals).toHaveLength(2);
    expect(signals[0]).toEqual({
      externalId: "t3_abc",
      url: "https://www.reddit.com/r/smallbusiness/comments/abc/how_do_you_chase/",
      title: "How do you chase late invoices?",
      body: "I spend every Friday chasing clients & it kills me.",
      author: "owner42",
      publishedAt: new Date("2026-10-20T12:00:00Z"),
      metadata: { subreddit: "smallbusiness", score: 57, numComments: 23 },
    });
    // A self post with an empty body falls back to the title.
    expect(signals[1].body).toBe("Title");
  });

  it("paginates with `after` up to maxPages", async () => {
    const { fetchImpl, calls } = fakeReddit({
      "SaaS:": listing([post({ name: "t3_1" })], "t3_1"),
      "SaaS:t3_1": listing([post({ name: "t3_2" })], "t3_2"),
      "SaaS:t3_2": listing([post({ name: "t3_3" })], "t3_3"),
    });
    const adapter = createRedditAdapter({ ...credentials, subreddits: ["SaaS"], fetchImpl, maxPages: 2 });

    const signals = await adapter.fetchSignals();

    expect(signals.map((s) => s.externalId)).toEqual(["t3_1", "t3_2"]);
    expect(calls.filter((c) => c.url.hostname === "oauth.reddit.com")).toHaveLength(2);
  });

  it("stops at posts older than `since` and does not fetch further pages", async () => {
    const { fetchImpl, calls } = fakeReddit({
      "SaaS:": listing(
        [
          post({ name: "t3_new", created_utc: T("2026-10-20T12:00:00Z") }),
          post({ name: "t3_old", created_utc: T("2026-10-19T12:00:00Z") }),
        ],
        "t3_old",
      ),
      "SaaS:t3_old": listing([post({ name: "t3_older" })]),
    });
    const adapter = createRedditAdapter({ ...credentials, subreddits: ["SaaS"], fetchImpl });

    const signals = await adapter.fetchSignals({ since: new Date("2026-10-20T00:00:00Z") });

    expect(signals.map((s) => s.externalId)).toEqual(["t3_new"]);
    expect(calls.filter((c) => c.url.hostname === "oauth.reddit.com")).toHaveLength(1);
  });

  it("filters out posts that are not useful signals", async () => {
    const { fetchImpl } = fakeReddit({
      "SaaS:": listing([post({ name: "t3_ok" }), post({ name: "t3_pin", stickied: true }), post({ name: "t3_link", is_self: false })]),
    });
    const signals = await createRedditAdapter({ ...credentials, subreddits: ["SaaS"], fetchImpl }).fetchSignals();
    expect(signals.map((s) => s.externalId)).toEqual(["t3_ok"]);
  });

  it("reports authentication and API errors clearly", async () => {
    const badAuth = fakeReddit({}, { tokenStatus: 401 });
    await expect(
      createRedditAdapter({ ...credentials, subreddits: ["SaaS"], fetchImpl: badAuth.fetchImpl }).fetchSignals(),
    ).rejects.toThrow("Reddit authentication failed (401)");

    const missing = fakeReddit({});
    await expect(
      createRedditAdapter({ ...credentials, subreddits: ["doesnotexist"], fetchImpl: missing.fetchImpl }).fetchSignals(),
    ).rejects.toThrow("404 for r/doesnotexist");
  });
});

describe("createRedditAdapterFromEnv", () => {
  it("requires credentials", () => {
    expect(() => createRedditAdapterFromEnv({})).toThrow("REDDIT_CLIENT_ID");
  });

  it("builds the adapter with configured or default subreddits", () => {
    expect(createRedditAdapterFromEnv({ REDDIT_CLIENT_ID: "id", REDDIT_CLIENT_SECRET: "s" }).id).toBe("reddit");
    expect(DEFAULT_SUBREDDITS).toContain("smallbusiness");
  });

  it("parses SEEDBOX_SUBREDDITS, accepting an r/ prefix", async () => {
    const { fetchImpl, calls } = fakeReddit({ "SaaS:": listing([]), "freelance:": listing([]) });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(fetchImpl);
    try {
      await createRedditAdapterFromEnv({
        REDDIT_CLIENT_ID: "id",
        REDDIT_CLIENT_SECRET: "s",
        SEEDBOX_SUBREDDITS: " r/SaaS, freelance ,",
      }).fetchSignals();
    } finally {
      fetchSpy.mockRestore();
    }
    const subreddits = calls.filter((c) => c.url.hostname === "oauth.reddit.com").map((c) => c.url.pathname);
    expect(subreddits).toEqual(["/r/SaaS/new", "/r/freelance/new"]);
  });
});

describe("sourceLabel", () => {
  it("shows the subreddit for Reddit and the source id otherwise", async () => {
    const { sourceLabel } = await import("./types");
    expect(sourceLabel("reddit", { subreddit: "smallbusiness" })).toBe("r/smallbusiness");
    expect(sourceLabel("reddit", {})).toBe("reddit");
    expect(sourceLabel("hackernews", null)).toBe("hackernews");
  });
});
