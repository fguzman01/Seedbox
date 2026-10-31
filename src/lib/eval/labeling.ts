import { quoteAppearsIn } from "../text";
import type { EvalItem, ExpectedPain } from "./dataset";

/** Target size of the dataset (H8). */
export const LABELING_GOAL = 30;

export class LabelError extends Error {}

/** Returns a copy of the dataset with the item labeled. Quotes must be copied from the post. */
export function applyLabel(
  items: EvalItem[],
  id: string,
  expected: ExpectedPain[],
  notes?: string,
): EvalItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new LabelError(`Unknown item "${id}"`);
  const item = items[index];

  for (const pain of expected) {
    if (!quoteAppearsIn(pain.quote, item)) {
      throw new LabelError(`The quote "${pain.quote}" is not in the post`);
    }
  }

  const updated: EvalItem = { ...item, expected, notes: notes?.trim() || undefined };
  return items.map((it, i) => (i === index ? updated : it));
}

export function labelingProgress(items: EvalItem[]) {
  const labeled = items.filter((item) => item.expected !== null);
  return {
    total: items.length,
    labeled: labeled.length,
    withPains: labeled.filter((item) => item.expected!.length > 0).length,
    goal: LABELING_GOAL,
  };
}
