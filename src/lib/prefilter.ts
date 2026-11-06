import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { signals } from "./db/schema";

/**
 * Form-based noise prefilter (H13, ADR-0011): posts whose form never carries a pain are
 * discarded without AI when the extraction work is handed out. Rules look only at the form
 * (who posts, a fixed recurring title, no text at all), never at the topic, tone or length.
 * Every rule is anchored and exact: when in doubt, it does not match.
 */

/** What a rule can look at: the stored post, as read from `signals`. */
export interface PrefilterInput {
  source: string;
  title: string | null;
  body: string;
  author: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NoiseRule {
  /** Stored in `metadata.prefilter`; never rename an id that already marked posts. */
  id: string;
  /** Reason shown in the UI after "prefiltro: ", in Spanish. */
  label: string;
  /** Only posts from this source; null = every source. */
  source: string | null;
  matches: (signal: PrefilterInput) => boolean;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The recurring monthly threads of Hacker News, title from start to end with month and year. */
const HN_MONTHLY_TITLE = new RegExp(
  `^Ask HN: (?:Who is hiring\\?|Who wants to be hired\\?|Freelancer\\? Seeking freelancer\\?|What are you working on\\?) \\((?:${MONTHS.join("|")}) \\d{4}\\)$`,
  "i",
);

/** The account that only posts the monthly hiring threads. */
const HN_MONTHLY_AUTHOR = "whoishiring";

export const NOISE_RULES: readonly NoiseRule[] = [
  {
    id: "hn-monthly-thread",
    label: "hilo mensual de Hacker News",
    source: "hackernews",
    matches: ({ title, author }) => author === HN_MONTHLY_AUTHOR || HN_MONTHLY_TITLE.test((title ?? "").trim()),
  },
  {
    id: "empty",
    label: "post sin texto",
    source: null,
    matches: ({ title, body }) => (title ?? "").trim() === "" && body.trim() === "",
  },
];

/** The first rule the post matches, or null when it must be analyzed. */
export function matchNoiseRule(signal: PrefilterInput, rules: readonly NoiseRule[] = NOISE_RULES): NoiseRule | null {
  return rules.find((rule) => (rule.source === null || rule.source === signal.source) && rule.matches(signal)) ?? null;
}

/** The rule id a post was prefiltered with, or null (pending, processed or discarded by the analyst). */
export function prefilterRuleId(metadata: Record<string, unknown> | null | undefined): string | null {
  const id = metadata?.prefilter;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** "prefiltro: hilo mensual de Hacker News"; the bare id when the rule no longer exists. */
export function prefilterReason(ruleId: string, rules: readonly NoiseRule[] = NOISE_RULES): string {
  const rule = rules.find((r) => r.id === ruleId);
  return `prefiltro: ${rule?.label ?? ruleId}`;
}

/** SQL condition: the signal was discarded by the prefilter (has `metadata.prefilter`). */
export const prefilteredSql = sql<boolean>`(${signals.metadata} ? 'prefilter')`;

export interface PrefilterResult {
  discarded: number;
  /** Discarded posts per rule id; rules without matches are left out. */
  byRule: Record<string, number>;
}

/**
 * Discards every pending signal that matches a noise rule: status "discarded", `processed_at`
 * = now and `metadata.prefilter` = rule id, keeping the other metadata keys. Runs over the whole
 * queue and is idempotent; processed and discarded signals are never touched (ADR-0011 §5).
 */
export async function prefilterPending(
  db: Database,
  now: Date,
  rules: readonly NoiseRule[] = NOISE_RULES,
): Promise<PrefilterResult> {
  const pending = await db
    .select({
      id: signals.id,
      source: signals.source,
      title: signals.title,
      body: signals.body,
      author: signals.author,
      metadata: signals.metadata,
    })
    .from(signals)
    .where(eq(signals.status, "pending"));

  const idsByRule = new Map<string, number[]>();
  for (const signal of pending) {
    const rule = matchNoiseRule(signal, rules);
    if (rule) idsByRule.set(rule.id, [...(idsByRule.get(rule.id) ?? []), signal.id]);
  }

  const result: PrefilterResult = { discarded: 0, byRule: {} };
  if (idsByRule.size === 0) return result;

  await db.transaction(async (tx) => {
    for (const [ruleId, ids] of idsByRule) {
      const marked = await tx
        .update(signals)
        .set({
          status: "discarded",
          processedAt: now,
          metadata: sql`${signals.metadata} || ${JSON.stringify({ prefilter: ruleId })}::jsonb`,
        })
        .where(and(inArray(signals.id, ids), eq(signals.status, "pending")))
        .returning({ id: signals.id });
      if (marked.length > 0) {
        result.byRule[ruleId] = marked.length;
        result.discarded += marked.length;
      }
    }
  });
  return result;
}
