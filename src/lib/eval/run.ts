import type { PainExtractor, TokenUsage } from "../extraction";
import type { ExtractedPain } from "../pains";
import { estimateCost, sumUsage } from "./cost";
import type { LabeledEvalItem } from "./dataset";
import { scoreItem, summarize, type EvalSummary, type ItemScore } from "./metrics";

export interface ItemRun {
  score: ItemScore | null;
  extracted: ExtractedPain[];
  error: string | null;
  latencyMs: number;
}

export interface EvalRun {
  model: string;
  startedAt: string;
  summary: EvalSummary;
  usage: TokenUsage;
  costUsd: number | null;
  avgLatencyMs: number | null;
  items: Record<string, ItemRun>;
}

export async function runEval(
  items: LabeledEvalItem[],
  extractor: PainExtractor,
  { concurrency = 4 } = {},
): Promise<EvalRun> {
  const startedAt = new Date().toISOString();
  const runs: Record<string, ItemRun> = {};
  const usages: TokenUsage[] = [];
  const queue = [...items];

  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const start = performance.now();
      try {
        const { pains, usage } = await extractor.extract(item);
        if (usage) usages.push(usage);
        runs[item.id] = {
          score: scoreItem(item, pains),
          extracted: pains,
          error: null,
          latencyMs: performance.now() - start,
        };
      } catch (error) {
        runs[item.id] = {
          score: null,
          extracted: [],
          error: error instanceof Error ? error.message : String(error),
          latencyMs: performance.now() - start,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  const completed = Object.values(runs).filter((r) => r.score !== null);
  const usage = sumUsage(usages);
  return {
    model: extractor.model,
    startedAt,
    summary: summarize(
      completed.map((r) => r.score!),
      items.length - completed.length,
    ),
    usage,
    costUsd: estimateCost(extractor.model, usage),
    avgLatencyMs: completed.length
      ? completed.reduce((sum, r) => sum + r.latencyMs, 0) / completed.length
      : null,
    items: runs,
  };
}
