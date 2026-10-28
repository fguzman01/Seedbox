import { describe, expect, it, vi } from "vitest";
import page0 from "./__fixtures__/hn-ask-page0.json";
import page1 from "./__fixtures__/hn-ask-page1.json";
import { createHackerNewsAdapter, htmlToText } from "./hackernews";

function mockFetch(pages: unknown[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const page = Number(new URL(String(input)).searchParams.get("page"));
    return new Response(JSON.stringify(pages[page]), { status: 200 });
  });
}

describe("htmlToText", () => {
  it("converts paragraphs, tags and entities", () => {
    expect(htmlToText("We&#x27;re <i>4</i> people.<p>$20&#x2F;month &amp; more")).toBe(
      "We're 4 people.\n\n$20/month & more",
    );
  });
});

describe("hackernews adapter", () => {
  it("fetches every page and normalizes hits", async () => {
    const fetchImpl = mockFetch([page0, page1]);
    const adapter = createHackerNewsAdapter({ fetchImpl });

    const signals = await adapter.fetchSignals();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(3);
    expect(signals[0]).toEqual({
      externalId: "41000002",
      url: "https://news.ycombinator.com/item?id=41000002",
      title: "Ask HN: How do you manage invoices for a small agency?",
      body: expect.stringContaining("I'd happily pay $20/month"),
      author: "jdoe",
      publishedAt: new Date("2026-10-20T12:00:00Z"),
      metadata: { points: 42, numComments: 31 },
    });
  });

  it("falls back to the title when a post has no text", async () => {
    const adapter = createHackerNewsAdapter({ fetchImpl: mockFetch([page0, page1]) });
    const [, second] = await adapter.fetchSignals();
    expect(second.body).toBe("Ask HN: What are you working on this month?");
    expect(second.metadata).toEqual({ points: 5, numComments: 0 });
  });

  it("filters by date when `since` is given", async () => {
    const fetchImpl = mockFetch([{ ...page0, nbPages: 1 }]);
    const adapter = createHackerNewsAdapter({ fetchImpl });

    await adapter.fetchSignals({ since: new Date("2026-10-20T00:00:00Z") });

    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get("tags")).toBe("ask_hn");
    expect(url.searchParams.get("numericFilters")).toBe("created_at_i>1792454400");
  });

  it("stops at maxPages", async () => {
    const fetchImpl = mockFetch([page0, page1]);
    await createHackerNewsAdapter({ fetchImpl, maxPages: 1 }).fetchSignals();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    await expect(createHackerNewsAdapter({ fetchImpl }).fetchSignals()).rejects.toThrow("429");
  });

  it("throws on malformed responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ nope: true })));
    await expect(createHackerNewsAdapter({ fetchImpl }).fetchSignals()).rejects.toThrow();
  });
});
