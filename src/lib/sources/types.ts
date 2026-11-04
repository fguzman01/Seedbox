export const DOMAINS = ["software"] as const;
export type Domain = (typeof DOMAINS)[number];

/** A raw item from an external source, normalized to a common shape. */
export interface RawSignal {
  externalId: string;
  url: string;
  title: string | null;
  body: string;
  author: string | null;
  publishedAt: Date;
  metadata: Record<string, unknown>;
}

export interface FetchOptions {
  /** Only return items published strictly after this date. */
  since?: Date;
  /**
   * Only return items published at or before this date, so their activity has matured
   * (ADR-0009). Newer items are left for a later run; `since` makes sure they are not lost.
   */
  until?: Date;
  /** Called once per feed (site, subreddit) by adapters that report per-feed counts. */
  onFeed?: (report: FeedFetchReport) => void;
}

/** What one feed of a source brought in a run, before storing. */
export interface FeedFetchReport {
  feed: string;
  /** Items returned by the API. */
  fetched: number;
  /** Dropped by the adapter's quality filters (e.g. negative score). */
  filtered: number;
  /** Dropped by the per-feed cap (SEEDBOX_MAX_NEW_PER_FEED). */
  capped: number;
}

/** A stored item the adapter is asked to look up again (deletion check, ADR-0010). */
export interface StoredSignalRef {
  externalId: string;
}

export interface ReconcileResult {
  /** External ids the source no longer returns (probably deleted). */
  missing: string[];
}

/** An optional source without credentials: skipped when ingesting all sources, not a failure. */
export class SourceNotConfiguredError extends Error {}

export interface SourceAdapter {
  id: string;
  domain: Domain;
  fetchSignals(options?: FetchOptions): Promise<RawSignal[]>;
  /** Optional: which of the recently stored items the source no longer has (ADR-0010). */
  reconcile?(stored: StoredSignalRef[]): Promise<ReconcileResult>;
  /** How many days back stored items are checked with `reconcile`. */
  reconcileDays?: number;
}

/** The feed of a source an item came from: its subreddit (Reddit) or site (Stack Exchange). */
export function feedOf(metadata?: Record<string, unknown> | null): string | null {
  const feed = metadata?.subreddit ?? metadata?.site;
  return typeof feed === "string" ? feed : null;
}

/** How a feed is shown: "r/SaaS" for Reddit, the site name otherwise. */
export function feedLabel(source: string, feed: string): string {
  return source === "reddit" ? `r/${feed}` : feed;
}

/**
 * Human-readable source: "r/smallbusiness" for Reddit, the site's domain for Stack Exchange
 * (e.g. "money.stackexchange.com", taken from the item's URL), the source id otherwise.
 */
export function sourceLabel(source: string, metadata?: Record<string, unknown> | null, url?: string): string {
  if (source === "reddit" && typeof metadata?.subreddit === "string") return `r/${metadata.subreddit}`;
  if (source === "stackexchange") {
    const host = url ? hostOf(url) : null;
    if (host) return host;
    if (typeof metadata?.site === "string") return metadata.site;
  }
  return source;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
