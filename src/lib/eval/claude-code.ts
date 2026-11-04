import { z } from "zod";
import { EXTRACTION_RULES, keepVerifiedPains } from "../extraction";
import { extractedPainSchema, type ExtractedPain } from "../pains";
import type { EvalItem, LabeledEvalItem } from "./dataset";
import type { EvalExtractor } from "./run";

/**
 * Measuring the extraction with Claude Code instead of the Claude API (H8, ADR-0008):
 * the posts are exported in the same format as the analyst's `.agent/extract.work.json`,
 * Claude Code writes results in the format of `extract.results.json`, and those results
 * are scored by `runEval` through an extractor that answers from them.
 */

export const CLAUDE_CODE_MODEL = "claude-code";

export interface ExtractWorkItem {
  id: string;
  source: string;
  url: string;
  title: string | null;
  body: string;
}

export interface ExtractWork {
  kind: "extract";
  rules: string;
  items: ExtractWorkItem[];
}

/** The work file for the posts, without labels: whoever extracts must not see them. */
export function buildEvalWork(items: EvalItem[]): ExtractWork {
  return {
    kind: "extract",
    rules: EXTRACTION_RULES,
    items: items.map(({ id, source, url, title, body }) => ({ id, source, url, title, body })),
  };
}

/** Same shape as the analyst's extract results, with the dataset id as signalId. */
export const evalResultsSchema = z.object({
  results: z.array(
    z.object({
      signalId: z.string().min(1),
      pains: z.array(extractedPainSchema).max(20),
    }),
  ),
});

export class EvalResultsError extends Error {}

/** Parses a results file into a map by dataset id, rejecting invalid or duplicated entries. */
export function parseEvalResults(content: string): Map<string, ExtractedPain[]> {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    throw new EvalResultsError(`Results file is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = evalResultsSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new EvalResultsError(`Invalid results:\n  ${issues.join("\n  ")}`);
  }
  const byId = new Map<string, ExtractedPain[]>();
  for (const { signalId, pains } of parsed.data.results) {
    if (byId.has(signalId)) throw new EvalResultsError(`Duplicated result for ${signalId}`);
    byId.set(signalId, pains);
  }
  return byId;
}

export interface ResultsExtractor extends EvalExtractor {
  /** Pains dropped because their quote is not verbatim in the post, by dataset id. */
  unverified: Record<string, ExtractedPain[]>;
}

/**
 * An extractor that answers from precomputed results, applying the same validation as
 * production (verbatim quotes). Posts without a result fail, so they count as failed.
 */
export function createResultsExtractor(
  results: Map<string, ExtractedPain[]>,
  model = CLAUDE_CODE_MODEL,
): ResultsExtractor {
  const unverified: Record<string, ExtractedPain[]> = {};
  return {
    model,
    unverified,
    async extract(input) {
      const extracted = results.get(input.id);
      if (!extracted) throw new Error("No result for this post");
      const verified = keepVerifiedPains(input, extracted);
      const dropped = extracted.filter((pain) => !verified.includes(pain));
      if (dropped.length) unverified[input.id] = dropped;
      return { pains: verified };
    },
  };
}

/** Result ids that are not labeled posts of the evaluated set; they are ignored. */
export function unknownResultIds(results: Map<string, unknown>, items: LabeledEvalItem[]): string[] {
  const ids = new Set(items.map((item) => item.id));
  return [...results.keys()].filter((id) => !ids.has(id));
}
