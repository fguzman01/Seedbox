import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { signals } from "../db/schema";
import type { EvalItem } from "./dataset";

export function evalItemId(signal: { source: string; externalId: string }): string {
  return `${signal.source}:${signal.externalId}`;
}

/** Picks random signals that are not in the dataset yet, as unlabeled items. */
export async function sampleSignals(
  db: Database,
  existing: EvalItem[],
  count: number,
): Promise<EvalItem[]> {
  const taken = new Set(existing.map((item) => item.id));
  // Over-fetch so that skipping signals already in the dataset still leaves enough.
  const candidates = await db
    .select()
    .from(signals)
    .orderBy(sql`random()`)
    .limit(count + taken.size);

  return candidates
    .filter((s) => !taken.has(evalItemId(s)))
    .slice(0, count)
    .map((s) => ({
      id: evalItemId(s),
      source: s.source,
      url: s.url,
      title: s.title,
      body: s.body,
      expected: null,
    }));
}
