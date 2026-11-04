/**
 * How the analyst's work is handed out (H11, ADR-0009). Pure functions, shared by the Claude Code
 * analyst (agent API) and the Claude API pipeline so both modes follow the same order.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Activity metrics as stored by the source adapters in `signals.metadata`. */
type Metadata = Record<string, unknown> | null | undefined;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Comments on the post: `numComments` (Hacker News, Reddit) or `answerCount` (Stack Exchange). */
export function commentCount(metadata: Metadata): number {
  return numberOrNull(metadata?.numComments) ?? numberOrNull(metadata?.answerCount) ?? 0;
}

/** Points or score on the post: `points` (Hacker News) or `score` (Reddit, Stack Exchange). */
export function pointCount(metadata: Metadata): number {
  return numberOrNull(metadata?.points) ?? numberOrNull(metadata?.score) ?? 0;
}

export interface ActivityItem {
  id: number;
  publishedAt: Date;
  metadata: Metadata;
}

/**
 * Most activity first, within a single source (activity is not compared across sources): more
 * comments, then more points, then the most recent, then the lowest id. A source without metrics
 * is therefore ordered by date only.
 */
export function compareByActivity(a: ActivityItem, b: ActivityItem): number {
  return (
    commentCount(b.metadata) - commentCount(a.metadata) ||
    pointCount(b.metadata) - pointCount(a.metadata) ||
    b.publishedAt.getTime() - a.publishedAt.getTime() ||
    a.id - b.id
  );
}

/** Keeps the `max` most active items (ADR-0009 §3: per-feed cap on new posts). */
export function keepMostActive<T extends Omit<ActivityItem, "id">>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareByActivity({ ...a.item, id: a.index }, { ...b.item, id: b.index }))
    .slice(0, max)
    .map(({ item }) => item);
}

/**
 * Splits `limit` into equal shares among the given sources; a source with fewer pending items
 * than its share gives the rest to the others. The remainder of an uneven split goes to the
 * sources first in `sizes` order.
 */
export function splitEqually(sizes: Map<string, number>, limit: number): Map<string, number> {
  const quotas = new Map([...sizes.keys()].map((source) => [source, 0]));
  let left = Math.max(0, Math.floor(limit));
  let open = [...sizes.keys()].filter((source) => sizes.get(source)! > 0);
  while (left > 0 && open.length > 0) {
    const share = Math.floor(left / open.length);
    const extra = left % open.length;
    let given = 0;
    open.forEach((source, i) => {
      const room = sizes.get(source)! - quotas.get(source)!;
      const take = Math.min(room, share + (i < extra ? 1 : 0));
      quotas.set(source, quotas.get(source)! + take);
      given += take;
    });
    left -= given;
    open = open.filter((source) => quotas.get(source)! < sizes.get(source)!);
  }
  return quotas;
}

export interface PendingPost extends ActivityItem {
  source: string;
  fetchedAt: Date;
}

export interface PlanOptions {
  now?: Date;
  /** Posts pending for longer than this many days (by `fetchedAt`) are "aged". */
  maxPendingDays: number;
}

/**
 * Picks the extraction batch (ADR-0009 §5–6) and returns it in hand-out order:
 * 1. `limit` is split in equal shares among the sources with pending posts (see splitEqually).
 * 2. Within each source, aged posts take up to half its share (rounded up, so a share of one
 *    still drains them), oldest `fetchedAt` first; the rest goes to the most active posts
 *    (compareByActivity), aged or not.
 * 3. The batch interleaves the sources (one post of each in turn, sources by name), so a session
 *    cut short still covers every source.
 */
export function planExtraction<T extends PendingPost>(posts: T[], limit: number, { now = new Date(), maxPendingDays }: PlanOptions): T[] {
  const agedBefore = now.getTime() - maxPendingDays * DAY_MS;
  const bySource = new Map<string, T[]>();
  for (const post of [...posts].sort((a, b) => a.source.localeCompare(b.source))) {
    bySource.set(post.source, [...(bySource.get(post.source) ?? []), post]);
  }
  const quotas = splitEqually(new Map([...bySource].map(([source, items]) => [source, items.length])), limit);

  const picks = [...bySource].map(([source, items]) => {
    const quota = quotas.get(source)!;
    const aged = items
      .filter((p) => p.fetchedAt.getTime() < agedBefore)
      .sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime() || a.id - b.id)
      .slice(0, Math.ceil(quota / 2));
    const agedIds = new Set(aged.map((p) => p.id));
    const rest = items.filter((p) => !agedIds.has(p.id)).sort(compareByActivity);
    return [...aged, ...rest].slice(0, quota);
  });

  const batch: T[] = [];
  for (let i = 0; picks.some((pick) => i < pick.length); i++) {
    for (const pick of picks) if (i < pick.length) batch.push(pick[i]);
  }
  return batch;
}

export interface DueOpportunity {
  id: number;
  createdAt: Date;
  assessedAt: Date | null;
  authorCount: number;
  /** Total score without the market axes (they come from the assessment). */
  partialScore: number;
}

/**
 * Order of the assessment batch (H11, ADR-0009 §6):
 * 1. Never assessed and created more than `maxPendingDays` ago, oldest first.
 * 2. Other never assessed: more distinct authors, then higher partial score.
 * 3. Re-assessments of stale ones: oldest assessment first, then more distinct authors.
 * Ties are broken by the lowest id.
 */
export function orderDueOpportunities<T extends DueOpportunity>(items: T[], { now = new Date(), maxPendingDays }: PlanOptions): T[] {
  const agedBefore = now.getTime() - maxPendingDays * DAY_MS;
  const group = (o: T) => (o.assessedAt ? 2 : o.createdAt.getTime() < agedBefore ? 0 : 1);
  return [...items].sort((a, b) => {
    const ga = group(a);
    const diff = ga - group(b);
    if (diff) return diff;
    if (ga === 0) return a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
    if (ga === 1) return b.authorCount - a.authorCount || b.partialScore - a.partialScore || a.id - b.id;
    return a.assessedAt!.getTime() - b.assessedAt!.getTime() || b.authorCount - a.authorCount || a.id - b.id;
  });
}
