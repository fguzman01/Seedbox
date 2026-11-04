import { z } from "zod";
import { decodeEntities, htmlToText } from "../text";
import {
  SourceNotConfiguredError,
  type FetchOptions,
  type RawSignal,
  type ReconcileResult,
  type SourceAdapter,
  type StoredSignalRef,
} from "./types";

/**
 * Stack Exchange source (ADR-0010): questions from non-technical sites through the public API,
 * with a mandatory app key. Each site is a feed of the single "stackexchange" source.
 */

const API_URL = "https://api.stackexchange.com/2.3";
const USER_AGENT = "seedbox/0.1 (+https://github.com/fguzman01/Seedbox)";

/** Default `SEEDBOX_SE_SITES`, in ADR-0010's order (API `site` parameter). */
export const DEFAULT_SITES = [
  "softwarerecs",
  "webapps",
  "money",
  "workplace",
  "academia",
  "freelancing",
  "expatriates",
  "parenting",
];

/** Same variables and defaults as ADR-0009's general rules (H11). */
export const DEFAULT_MAX_NEW_PER_FEED = 25;
export const DEFAULT_MIN_AGE_HOURS = 24;

/** The first run reaches this many days before the minimum age cut (8 days back with the defaults). */
const FIRST_RUN_DAYS = 7;
/** Pages of 100 questions per site and run. */
const MAX_PAGES = 2;
/** Stored questions are checked for deletion this long after being stored. */
export const RECONCILE_DAYS = 30;
/** The API accepts up to 100 ids per request. */
const IDS_PER_REQUEST = 100;
/**
 * Filter for the deletion check. ADR-0010 suggests a custom filter with only `question_id`
 * (created once with /2.3/filters/create); until it is created against the real API, the
 * built-in default filter works, it just returns more fields than needed.
 */
const RECONCILE_FILTER = "default";

/** Longer backoffs than this stop the source for the run instead of waiting. */
const MAX_BACKOFF_SECONDS = 60;
/** Below this remaining daily quota the source stops for the run. */
const MIN_QUOTA_REMAINING = 100;
const THROTTLE_ERROR_ID = 502;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const ownerSchema = z.object({
  display_name: z.string().nullish(),
  link: z.string().nullish(),
  user_type: z.string().nullish(),
});

const questionSchema = z.object({
  question_id: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  link: z.string(),
  score: z.number(),
  answer_count: z.number().nullish(),
  view_count: z.number().nullish(),
  tags: z.array(z.string()).nullish(),
  owner: ownerSchema.nullish(),
  creation_date: z.number(),
  is_answered: z.boolean().nullish(),
  accepted_answer_id: z.number().nullish(),
  closed_date: z.number().nullish(),
  closed_reason: z.string().nullish(),
  content_license: z.string().nullish(),
});

export type Question = z.infer<typeof questionSchema>;

/** The common wrapper of every API response, including errors. */
const wrapperSchema = z.object({
  items: z.array(z.unknown()).nullish(),
  has_more: z.boolean().nullish(),
  quota_max: z.number().nullish(),
  quota_remaining: z.number().nullish(),
  backoff: z.number().nullish(),
  error_id: z.number().nullish(),
  error_name: z.string().nullish(),
  error_message: z.string().nullish(),
});

type Wrapper = z.infer<typeof wrapperSchema>;

/** Stack Exchange asked us to slow down: the source stops for this run (others keep going). */
export class StackExchangeThrottleError extends Error {}

export function toSignal(question: Question, site: string): RawSignal {
  const title = decodeEntities(question.title).trim();
  const body = question.body ? htmlToText(question.body) : "";
  const owner = question.owner;
  const author = owner?.display_name ? decodeEntities(owner.display_name) : null;
  // A deleted user keeps the name on the post but has no profile to link to.
  const ownerLink = owner?.user_type !== "does_not_exist" ? (owner?.link ?? null) : null;
  return {
    externalId: `${site}:${question.question_id}`,
    url: question.link,
    title,
    body: body || title,
    author,
    publishedAt: new Date(question.creation_date * 1000),
    metadata: {
      site,
      score: question.score,
      answerCount: question.answer_count ?? 0,
      viewCount: question.view_count ?? 0,
      tags: question.tags ?? [],
      hasAcceptedAnswer: question.accepted_answer_id != null,
      closed: question.closed_date != null,
      closedReason: question.closed_reason ?? null,
      ownerLink,
      license: question.content_license ?? null,
    },
  };
}

/** Negative score questions are usually spam or low quality (ADR-0010); closed and answered ones stay. */
export function isUsefulQuestion(question: Pick<Question, "score">): boolean {
  return question.score >= 0;
}

/**
 * The per-site cap (ADR-0009/0010): most answers first, then score, then the newest. Answers stand
 * in for "comments": they show that other people recognize the problem.
 */
export function selectForFeed<T extends Pick<Question, "answer_count" | "score" | "creation_date">>(
  questions: T[],
  max: number,
): T[] {
  return [...questions]
    .sort(
      (a, b) =>
        (b.answer_count ?? 0) - (a.answer_count ?? 0) || b.score - a.score || b.creation_date - a.creation_date,
    )
    .slice(0, max);
}

/** Splits "money:123" into its site and question id; null when malformed. */
export function parseExternalId(externalId: string): { site: string; questionId: number } | null {
  const match = /^(.+):(\d+)$/.exec(externalId);
  return match ? { site: match[1], questionId: Number(match[2]) } : null;
}

export interface StackExchangeOptions {
  key: string;
  sites?: string[];
  maxNewPerFeed?: number;
  minAgeHours?: number;
  fetchImpl?: typeof fetch;
  /** Waits between requests when the API sends `backoff`; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createStackExchangeAdapter({
  key,
  sites = DEFAULT_SITES,
  maxNewPerFeed = DEFAULT_MAX_NEW_PER_FEED,
  minAgeHours = DEFAULT_MIN_AGE_HOURS,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = () => new Date(),
}: StackExchangeOptions): SourceAdapter {
  /** Seconds the API asked us to wait before the next request. */
  let pendingBackoff = 0;

  /** One request at a time, honoring `backoff`, `quota_remaining` and throttle errors. */
  async function call(path: string, params: Record<string, string>): Promise<Wrapper> {
    if (pendingBackoff > 0) {
      await sleep(pendingBackoff * 1000);
      pendingBackoff = 0;
    }
    const query = new URLSearchParams({ ...params, key });
    // No Accept-Encoding: the API always answers gzip and fetch decompresses it.
    const res = await fetchImpl(`${API_URL}${path}?${query}`, { headers: { "User-Agent": USER_AGENT } });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Stack Exchange API responded ${res.status} without JSON for ${path}`);
    }
    const data = wrapperSchema.parse(json);
    const where = params.site ? ` (site ${params.site})` : "";
    if (data.error_id != null || !res.ok) {
      const detail = `${data.error_name ?? res.status}: ${data.error_message ?? "no message"}${where}`;
      if (data.error_id === THROTTLE_ERROR_ID || data.error_name === "throttle_violation") {
        throw new StackExchangeThrottleError(`Stack Exchange throttle_violation, stopping until the next run: ${detail}`);
      }
      throw new Error(`Stack Exchange API error ${detail}`);
    }
    if (data.backoff != null && data.backoff > 0) {
      if (data.backoff > MAX_BACKOFF_SECONDS) {
        throw new StackExchangeThrottleError(
          `Stack Exchange backoff too long (${data.backoff}s), stopping until the next run${where}`,
        );
      }
      pendingBackoff = data.backoff;
    }
    if (data.quota_remaining != null && data.quota_remaining < MIN_QUOTA_REMAINING) {
      throw new StackExchangeThrottleError(
        `Stack Exchange quota almost exhausted (quota_remaining=${data.quota_remaining}), stopping until the next run`,
      );
    }
    return data;
  }

  async function fetchSite(site: string, from: Date, to: Date): Promise<Question[]> {
    const questions: Question[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await call("/questions", {
        site,
        sort: "creation",
        order: "desc",
        fromdate: String(Math.floor(from.getTime() / 1000)),
        todate: String(Math.floor(to.getTime() / 1000)),
        pagesize: "100",
        page: String(page),
        filter: "withbody",
      });
      questions.push(...(data.items ?? []).map((item) => questionSchema.parse(item)));
      if (!data.has_more) break;
    }
    return questions;
  }

  return {
    id: "stackexchange",
    domain: "software",
    reconcileDays: RECONCILE_DAYS,

    // Every site is fetched before returning: if one fails, nothing is stored and the next run
    // asks again for the same window (ADR-0010).
    async fetchSignals({ since, until, onFeed }: FetchOptions = {}) {
      // `ingest` passes the shared maturity cut (ADR-0009); the adapter's own one is a fallback.
      const to = until ?? new Date(now().getTime() - minAgeHours * HOUR_MS);
      const from = since ?? new Date(to.getTime() - FIRST_RUN_DAYS * DAY_MS);
      const signals: RawSignal[] = [];
      for (const site of sites) {
        const fetched = from.getTime() <= to.getTime() ? await fetchSite(site, from, to) : [];
        // `fromdate` includes its own second; keep only questions strictly after the cut.
        const fresh = since ? fetched.filter((q) => q.creation_date * 1000 > since.getTime()) : fetched;
        const useful = fresh.filter(isUsefulQuestion);
        const kept = selectForFeed(useful, maxNewPerFeed);
        onFeed?.({
          feed: site,
          fetched: fresh.length,
          filtered: fresh.length - useful.length,
          capped: useful.length - kept.length,
        });
        signals.push(...kept.map((q) => toSignal(q, site)));
      }
      return signals;
    },

    async reconcile(stored: StoredSignalRef[]): Promise<ReconcileResult> {
      const bySite = new Map<string, Map<number, string>>();
      for (const { externalId } of stored) {
        const parsed = parseExternalId(externalId);
        if (!parsed) continue;
        const ids = bySite.get(parsed.site) ?? new Map<number, string>();
        ids.set(parsed.questionId, externalId);
        bySite.set(parsed.site, ids);
      }
      const missing: string[] = [];
      for (const [site, ids] of bySite) {
        const all = [...ids.keys()];
        for (let i = 0; i < all.length; i += IDS_PER_REQUEST) {
          const chunk = all.slice(i, i + IDS_PER_REQUEST);
          const data = await call(`/questions/${chunk.join(";")}`, {
            site,
            pagesize: String(IDS_PER_REQUEST),
            filter: RECONCILE_FILTER,
          });
          const present = new Set(
            (data.items ?? []).map((item) => z.object({ question_id: z.number() }).parse(item).question_id),
          );
          for (const id of chunk) if (!present.has(id)) missing.push(ids.get(id)!);
        }
      }
      return { missing };
    },
  };
}

function intFromEnv(value: string | undefined, fallback: number, min: number): number {
  const n = Number(value);
  return value?.trim() && Number.isInteger(n) && n >= min ? n : fallback;
}

/** Comma separated API site names; empty or missing means the defaults. */
export function parseSites(value: string | undefined): string[] {
  const sites = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return sites.length ? [...new Set(sites)] : DEFAULT_SITES;
}

/** Builds the adapter from environment variables (ADR-0010). The key is required. */
export function createStackExchangeAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
): SourceAdapter {
  const key = env.STACKEXCHANGE_KEY?.trim();
  if (!key) {
    throw new SourceNotConfiguredError(
      "Stack Exchange is not configured: set STACKEXCHANGE_KEY (register an app at https://stackapps.com/apps/oauth/register)",
    );
  }
  return createStackExchangeAdapter({
    key,
    sites: parseSites(env.SEEDBOX_SE_SITES),
    maxNewPerFeed: intFromEnv(env.SEEDBOX_MAX_NEW_PER_FEED, DEFAULT_MAX_NEW_PER_FEED, 1),
    minAgeHours: intFromEnv(env.SEEDBOX_INGEST_MIN_AGE_HOURS, DEFAULT_MIN_AGE_HOURS, 0),
  });
}
