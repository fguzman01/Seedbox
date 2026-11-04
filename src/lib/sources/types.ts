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
}

/** An optional source without credentials: skipped when ingesting all sources, not a failure. */
export class SourceNotConfiguredError extends Error {}

export interface SourceAdapter {
  id: string;
  domain: Domain;
  fetchSignals(options?: FetchOptions): Promise<RawSignal[]>;
}

/** Human-readable source, e.g. "r/smallbusiness" for Reddit, "hackernews" otherwise. */
export function sourceLabel(source: string, metadata?: Record<string, unknown> | null): string {
  if (source === "reddit" && typeof metadata?.subreddit === "string") return `r/${metadata.subreddit}`;
  return source;
}
