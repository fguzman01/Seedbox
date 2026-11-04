import { z } from "zod";
import { htmlToText } from "../text";
import type { FetchOptions, RawSignal, SourceAdapter } from "./types";

const API_URL = "https://hn.algolia.com/api/v1/search_by_date";
const ITEM_URL = "https://news.ycombinator.com/item?id=";

const hitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullish(),
  story_text: z.string().nullish(),
  author: z.string().nullish(),
  created_at_i: z.number(),
  points: z.number().nullish(),
  num_comments: z.number().nullish(),
});

const responseSchema = z.object({
  hits: z.array(hitSchema),
  page: z.number(),
  nbPages: z.number(),
});

type Hit = z.infer<typeof hitSchema>;

function toSignal(hit: Hit): RawSignal {
  const title = hit.title ?? null;
  const text = hit.story_text ? htmlToText(hit.story_text) : "";
  return {
    externalId: hit.objectID,
    url: ITEM_URL + hit.objectID,
    title,
    body: text || title || "",
    author: hit.author ?? null,
    publishedAt: new Date(hit.created_at_i * 1000),
    metadata: { points: hit.points ?? 0, numComments: hit.num_comments ?? 0 },
  };
}

/** A single feed, so the per-feed cap of ADR-0009 does not apply; `maxPages` bounds a run. */
export interface HackerNewsOptions {
  fetchImpl?: typeof fetch;
  /** Algolia tags filter; "ask_hn" is where people describe problems. */
  tags?: string;
  hitsPerPage?: number;
  maxPages?: number;
}

export function createHackerNewsAdapter({
  fetchImpl = fetch,
  tags = "ask_hn",
  hitsPerPage = 100,
  maxPages = 5,
}: HackerNewsOptions = {}): SourceAdapter {
  return {
    id: "hackernews",
    domain: "software",
    async fetchSignals({ since, until }: FetchOptions = {}) {
      const filters = [
        since && `created_at_i>${Math.floor(since.getTime() / 1000)}`,
        until && `created_at_i<=${Math.floor(until.getTime() / 1000)}`,
      ].filter(Boolean);
      const signals: RawSignal[] = [];
      for (let page = 0; page < maxPages; page++) {
        const params = new URLSearchParams({
          tags,
          hitsPerPage: String(hitsPerPage),
          page: String(page),
        });
        if (filters.length) params.set("numericFilters", filters.join(","));
        const res = await fetchImpl(`${API_URL}?${params}`);
        if (!res.ok) {
          throw new Error(`Hacker News API responded ${res.status}`);
        }
        const data = responseSchema.parse(await res.json());
        signals.push(...data.hits.map(toSignal));
        if (page + 1 >= data.nbPages) break;
      }
      return signals;
    },
  };
}
