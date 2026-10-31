import { z } from "zod";
import type { FetchOptions, RawSignal, SourceAdapter } from "./types";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_URL = "https://oauth.reddit.com";
const SITE_URL = "https://www.reddit.com";

export const DEFAULT_SUBREDDITS = ["SaaS", "smallbusiness", "Entrepreneur", "freelance", "startups", "sysadmin"];

const tokenSchema = z.object({ access_token: z.string() });

const postSchema = z.object({
  name: z.string(),
  title: z.string(),
  selftext: z.string().nullish(),
  author: z.string().nullish(),
  created_utc: z.number(),
  permalink: z.string(),
  subreddit: z.string(),
  score: z.number().nullish(),
  num_comments: z.number().nullish(),
  is_self: z.boolean().nullish(),
  stickied: z.boolean().nullish(),
  over_18: z.boolean().nullish(),
  removed_by_category: z.string().nullish(),
});

const listingSchema = z.object({
  data: z.object({
    after: z.string().nullish(),
    children: z.array(z.object({ data: postSchema })),
  }),
});

type Post = z.infer<typeof postSchema>;

const REMOVED_BODIES = new Set(["[removed]", "[deleted]"]);

/** Keeps only posts where someone wrote something: no pins, links, removals, NSFW or bots. */
export function isUsefulPost(post: Post): boolean {
  const body = post.selftext?.trim() ?? "";
  return (
    post.is_self !== false &&
    !post.stickied &&
    !post.over_18 &&
    !post.removed_by_category &&
    !REMOVED_BODIES.has(body) &&
    post.author !== "AutoModerator" &&
    post.author !== "[deleted]"
  );
}

function toSignal(post: Post): RawSignal {
  const body = post.selftext?.trim() ?? "";
  return {
    externalId: post.name,
    url: `${SITE_URL}${post.permalink}`,
    title: post.title,
    body: body || post.title,
    author: post.author ?? null,
    publishedAt: new Date(post.created_utc * 1000),
    metadata: {
      subreddit: post.subreddit,
      score: post.score ?? 0,
      numComments: post.num_comments ?? 0,
    },
  };
}

export interface RedditOptions {
  clientId: string;
  clientSecret: string;
  /** Reddit requires a descriptive user agent, e.g. "seedbox/0.1 by your_username". */
  userAgent: string;
  subreddits?: string[];
  fetchImpl?: typeof fetch;
  /** Pages of 100 posts per subreddit and run. */
  maxPages?: number;
}

export function createRedditAdapter({
  clientId,
  clientSecret,
  userAgent,
  subreddits = DEFAULT_SUBREDDITS,
  fetchImpl = fetch,
  maxPages = 3,
}: RedditOptions): SourceAdapter {
  let token: string | undefined;

  async function getToken(): Promise<string> {
    if (token) return token;
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(`Reddit authentication failed (${res.status}); check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET`);
    }
    token = tokenSchema.parse(await res.json()).access_token;
    return token;
  }

  async function fetchSubreddit(subreddit: string, since?: Date): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    let after: string | null | undefined;
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({ limit: "100", raw_json: "1" });
      if (after) params.set("after", after);
      const res = await fetchImpl(`${API_URL}/r/${encodeURIComponent(subreddit)}/new?${params}`, {
        headers: { Authorization: `Bearer ${await getToken()}`, "User-Agent": userAgent },
      });
      if (!res.ok) throw new Error(`Reddit API responded ${res.status} for r/${subreddit}`);

      const { data } = listingSchema.parse(await res.json());
      const posts = data.children.map((child) => child.data);
      // Listings are newest first: stop once we reach posts we already have.
      const fresh = since ? posts.filter((p) => p.created_utc * 1000 > since.getTime()) : posts;
      signals.push(...fresh.filter(isUsefulPost).map(toSignal));
      if (fresh.length < posts.length || !data.after) break;
      after = data.after;
    }
    return signals;
  }

  return {
    id: "reddit",
    domain: "software",
    async fetchSignals({ since }: FetchOptions = {}) {
      const signals: RawSignal[] = [];
      for (const subreddit of subreddits) {
        signals.push(...(await fetchSubreddit(subreddit, since)));
      }
      return signals;
    },
  };
}

/** Builds the adapter from environment variables (ADR-0006). */
export function createRedditAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
): SourceAdapter {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT, SEEDBOX_SUBREDDITS } = env;
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error(
      "Reddit is not configured: set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (create a script app at https://www.reddit.com/prefs/apps)",
    );
  }
  const subreddits = SEEDBOX_SUBREDDITS?.split(",")
    .map((s) => s.trim().replace(/^r\//, ""))
    .filter(Boolean);
  return createRedditAdapter({
    clientId: REDDIT_CLIENT_ID,
    clientSecret: REDDIT_CLIENT_SECRET,
    userAgent: REDDIT_USER_AGENT || "seedbox/0.1",
    subreddits: subreddits?.length ? subreddits : DEFAULT_SUBREDDITS,
  });
}
