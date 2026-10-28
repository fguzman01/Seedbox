import type { ExtractedPain } from "../pains";
import { normalizeText } from "../text";
import type { ExpectedPain, LabeledEvalItem } from "./dataset";

/**
 * Two quotes point at the same pain when one contains the other, or when most words of the
 * shorter one appear in the longer one. Humans and the model rarely select the exact same span.
 */
export function quotesMatch(a: string, b: string, minOverlap = 0.6): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const words = (s: string) => new Set(s.split(/[^\p{L}\p{N}']+/u).filter(Boolean));
  const [shorter, longer] = [words(na), words(nb)].sort((x, y) => x.size - y.size);
  if (shorter.size === 0) return false;
  let shared = 0;
  for (const w of shorter) if (longer.has(w)) shared++;
  return shared / shorter.size >= minOverlap;
}

export interface ItemScore {
  id: string;
  expected: number;
  extracted: number;
  /** Expected pains found by the extractor. */
  matched: number;
  /** Matched pains whose vertical is also right. */
  verticalCorrect: number;
  missed: ExpectedPain[];
  extra: ExtractedPain[];
}

/** Greedy one-to-one matching of extracted pains to expected pains by quote. */
export function scoreItem(item: LabeledEvalItem, extracted: ExtractedPain[]): ItemScore {
  const remaining = [...extracted];
  const missed: ExpectedPain[] = [];
  let matched = 0;
  let verticalCorrect = 0;

  for (const expected of item.expected) {
    const index = remaining.findIndex((p) => quotesMatch(p.quote, expected.quote));
    if (index === -1) {
      missed.push(expected);
      continue;
    }
    const [found] = remaining.splice(index, 1);
    matched++;
    if (found.vertical === expected.vertical) verticalCorrect++;
  }

  return {
    id: item.id,
    expected: item.expected.length,
    extracted: extracted.length,
    matched,
    verticalCorrect,
    missed,
    extra: remaining,
  };
}

export interface EvalSummary {
  items: number;
  failed: number;
  /** Post level: does the post contain at least one pain? */
  post: { precision: number | null; recall: number | null; accuracy: number | null };
  /** Pain level: are the individual pains right? */
  pain: { precision: number | null; recall: number | null };
  verticalAccuracy: number | null;
}

const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

export function summarize(scores: ItemScore[], failed = 0): EvalSummary {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let matched = 0;
  let expected = 0;
  let extracted = 0;
  let verticalCorrect = 0;

  for (const s of scores) {
    const hasExpected = s.expected > 0;
    const hasExtracted = s.extracted > 0;
    if (hasExpected && hasExtracted) tp++;
    else if (!hasExpected && hasExtracted) fp++;
    else if (hasExpected && !hasExtracted) fn++;
    else tn++;
    matched += s.matched;
    expected += s.expected;
    extracted += s.extracted;
    verticalCorrect += s.verticalCorrect;
  }

  return {
    items: scores.length,
    failed,
    post: {
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      accuracy: ratio(tp + tn, scores.length),
    },
    pain: { precision: ratio(matched, extracted), recall: ratio(matched, expected) },
    verticalAccuracy: ratio(verticalCorrect, matched),
  };
}
