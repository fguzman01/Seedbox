import { PAIN_TYPES, painType, type ExtractedPain, type PainType } from "../pains";
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

/**
 * An extracted pain as scored. The extraction does not produce a type yet (H18): a pain without
 * a type counts as concrete.
 */
export type ScoredPain = ExtractedPain & { type?: PainType };

export interface TypeCounts {
  /** Labeled pains of this type. */
  expected: number;
  /** Extracted pains attributed to this type: matched to a label of this type, or unmatched and of this type. */
  extracted: number;
  /** Labeled pains of this type found by the extractor. */
  matched: number;
}

export interface ItemScore {
  id: string;
  expected: number;
  extracted: number;
  /** Expected pains found by the extractor. */
  matched: number;
  /** Matched pains whose vertical is also right. */
  verticalCorrect: number;
  /** Matched pains whose extracted pain has a type of its own (none until H18). */
  typed: number;
  /** Typed matched pains whose type is also right. */
  typeCorrect: number;
  byType: Record<PainType, TypeCounts>;
  missed: ExpectedPain[];
  extra: ScoredPain[];
}

const emptyCounts = (): Record<PainType, TypeCounts> => ({
  concrete: { expected: 0, extracted: 0, matched: 0 },
  latent: { expected: 0, extracted: 0, matched: 0 },
});

/**
 * Greedy one-to-one matching of extracted pains to expected pains by quote. A match counts for
 * the type of the label: an extracted pain that matches a latent label is a latent hit, not a
 * concrete false positive, whatever type the extractor gave it. When several extracted pains
 * match, one of the same type as the label is preferred.
 */
export function scoreItem(item: LabeledEvalItem, extracted: ScoredPain[]): ItemScore {
  const remaining = [...extracted];
  const missed: ExpectedPain[] = [];
  const byType = emptyCounts();
  let matched = 0;
  let verticalCorrect = 0;
  let typed = 0;
  let typeCorrect = 0;

  for (const expected of item.expected) {
    const type = painType(expected);
    byType[type].expected++;
    const candidates = remaining
      .map((pain, index) => ({ pain, index }))
      .filter(({ pain }) => quotesMatch(pain.quote, expected.quote));
    if (candidates.length === 0) {
      missed.push(expected);
      continue;
    }
    const best = candidates.find(({ pain }) => painType(pain) === type) ?? candidates[0];
    const [found] = remaining.splice(best.index, 1);
    matched++;
    byType[type].matched++;
    byType[type].extracted++;
    if (found.vertical === expected.vertical) verticalCorrect++;
    if (found.type) {
      typed++;
      if (found.type === type) typeCorrect++;
    }
  }
  for (const pain of remaining) byType[painType(pain)].extracted++;

  return {
    id: item.id,
    expected: item.expected.length,
    extracted: extracted.length,
    matched,
    verticalCorrect,
    typed,
    typeCorrect,
    byType,
    missed,
    extra: remaining,
  };
}

export interface PrecisionRecall {
  precision: number | null;
  recall: number | null;
}

export interface EvalSummary {
  items: number;
  failed: number;
  /**
   * Post level, on concrete pains only: does the post contain at least one concrete pain?
   * A post whose only extracted pains match latent labels does not count as having one.
   */
  post: { precision: number | null; recall: number | null; accuracy: number | null };
  /** Pain level, all types together (the metric before H17). */
  pain: PrecisionRecall;
  /** Pain level, by type of the label (see TypeCounts for what counts as extracted). */
  byType: Record<PainType, PrecisionRecall & TypeCounts>;
  verticalAccuracy: number | null;
  /** Of matched pains with an extracted type, how many have the right one; null until H18. */
  typeAccuracy: number | null;
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
  let typed = 0;
  let typeCorrect = 0;
  const totals = emptyCounts();

  for (const s of scores) {
    const hasExpected = s.byType.concrete.expected > 0;
    const hasExtracted = s.byType.concrete.extracted > 0;
    if (hasExpected && hasExtracted) tp++;
    else if (!hasExpected && hasExtracted) fp++;
    else if (hasExpected && !hasExtracted) fn++;
    else tn++;
    matched += s.matched;
    expected += s.expected;
    extracted += s.extracted;
    verticalCorrect += s.verticalCorrect;
    typed += s.typed;
    typeCorrect += s.typeCorrect;
    for (const type of PAIN_TYPES) {
      totals[type].expected += s.byType[type].expected;
      totals[type].extracted += s.byType[type].extracted;
      totals[type].matched += s.byType[type].matched;
    }
  }

  const byType = (type: PainType) => ({
    ...totals[type],
    precision: ratio(totals[type].matched, totals[type].extracted),
    recall: ratio(totals[type].matched, totals[type].expected),
  });

  return {
    items: scores.length,
    failed,
    post: {
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      accuracy: ratio(tp + tn, scores.length),
    },
    pain: { precision: ratio(matched, extracted), recall: ratio(matched, expected) },
    byType: { concrete: byType("concrete"), latent: byType("latent") },
    verticalAccuracy: ratio(verticalCorrect, matched),
    typeAccuracy: ratio(typeCorrect, typed),
  };
}
