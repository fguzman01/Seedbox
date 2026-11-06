import { matchNoiseRule, NOISE_RULES, type NoiseRule, type PrefilterInput } from "../prefilter";
import { isLabeled, type EvalItem, type LabeledEvalItem } from "./dataset";

/**
 * Measures the noise prefilter against the labeled dataset (H13, ADR-0011 §4): which posts it
 * would discard, how many of them have no pain (the saving) and which have a pain (lost evidence,
 * must be none). No database and no API.
 */

/** A dataset row as the prefilter sees it; the dataset keeps neither author nor metadata. */
export function evalItemAsSignal(item: EvalItem): PrefilterInput {
  return { source: item.source, title: item.title, body: item.body, author: null, metadata: {} };
}

export interface PrefilterDiscard {
  item: LabeledEvalItem;
  rule: NoiseRule;
}

export interface PrefilterEval {
  total: number;
  withPain: number;
  withoutPain: number;
  discarded: PrefilterDiscard[];
  /** Discarded posts per rule id, in NOISE_RULES order; rules without matches included with 0. */
  byRule: { id: string; label: string; count: number }[];
  /** Discarded posts labeled with a concrete or latent pain: must be empty. */
  lost: PrefilterDiscard[];
  /** Discarded posts without pain. */
  saved: number;
  /** Saved over withoutPain, rounded percentage; null without posts without pain. */
  savedPercent: number | null;
}

export function evaluatePrefilter(items: EvalItem[], rules: readonly NoiseRule[] = NOISE_RULES): PrefilterEval {
  const labeled = items.filter(isLabeled);
  const discarded: PrefilterDiscard[] = [];
  for (const item of labeled) {
    const rule = matchNoiseRule(evalItemAsSignal(item), rules);
    if (rule) discarded.push({ item, rule });
  }
  const withPain = labeled.filter((item) => item.expected.length > 0).length;
  const withoutPain = labeled.length - withPain;
  const lost = discarded.filter((d) => d.item.expected.length > 0);
  const saved = discarded.length - lost.length;
  return {
    total: labeled.length,
    withPain,
    withoutPain,
    discarded,
    byRule: rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      count: discarded.filter((d) => d.rule.id === rule.id).length,
    })),
    lost,
    saved,
    savedPercent: withoutPain > 0 ? Math.round((saved / withoutPain) * 100) : null,
  };
}
