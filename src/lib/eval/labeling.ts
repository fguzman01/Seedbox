import { painType } from "../pains";
import { quoteAppearsIn } from "../text";
import { CURRENT_LABEL_VERSION, type EvalItem, type ExpectedPain } from "./dataset";

/** Target size of the dataset (H8). */
export const LABELING_GOAL = 30;

export class LabelError extends Error {}

/**
 * Returns a copy of the dataset with the item labeled. Quotes must be copied from the post.
 * The label follows the current criterion (H17): every pain gets an explicit type.
 */
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

  const updated: EvalItem = {
    ...item,
    expected: expected.map((pain) => ({ ...pain, type: painType(pain) })),
    notes: notes?.trim() || undefined,
    labels: CURRENT_LABEL_VERSION,
  };
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
