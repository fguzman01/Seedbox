/** Optional tuning variables for ingestion and work hand-out (ADR-0009). See docs/deploy.md. */

type Env = Record<string, string | undefined>;

/** Reads a number from the environment; missing or invalid values (or below `min`) use the default. */
function numberFromEnv(env: Env, name: string, fallback: number, min: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

/** Days a post or opportunity may wait before it enters the batch regardless of its signal. */
export const maxPendingDays = (env: Env = process.env) => numberFromEnv(env, "SEEDBOX_MAX_PENDING_DAYS", 14, 0);

/** Minimum age of a post before it is ingested, so its activity metrics have matured. */
export const ingestMinAgeHours = (env: Env = process.env) => numberFromEnv(env, "SEEDBOX_INGEST_MIN_AGE_HOURS", 24, 0);

/** Maximum new posts stored per feed (subreddit, Stack Exchange site) and run. */
export const maxNewPerFeed = (env: Env = process.env) =>
  Math.floor(numberFromEnv(env, "SEEDBOX_MAX_NEW_PER_FEED", 25, 1));
