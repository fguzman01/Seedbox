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
}

export interface SourceAdapter {
  id: string;
  domain: Domain;
  fetchSignals(options?: FetchOptions): Promise<RawSignal[]>;
}
