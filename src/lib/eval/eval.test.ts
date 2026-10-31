import { describe, expect, it } from "vitest";
import type { PainExtractor } from "../extraction";
import type { ExtractedPain } from "../pains";
import { estimateCost, sumUsage } from "./cost";
import { parseDataset, serializeDataset, type EvalItem, type LabeledEvalItem } from "./dataset";
import { applyLabel, LabelError, labelingProgress } from "./labeling";
import { quotesMatch, scoreItem, summarize } from "./metrics";
import { runEval } from "./run";

const item: LabeledEvalItem = {
  id: "hackernews:1",
  source: "hackernews",
  url: "https://news.ycombinator.com/item?id=1",
  title: "Ask HN: How do you manage invoices?",
  body: "We still use spreadsheets. Every tool I tried is too expensive. Also, chasing late payments eats my Fridays.",
  expected: [
    { quote: "Every tool I tried is too expensive", vertical: "freelance" },
    { quote: "chasing late payments eats my Fridays", vertical: "finance" },
  ],
};

function extracted(quote: string, vertical: ExtractedPain["vertical"] = "freelance"): ExtractedPain {
  return {
    description: "d",
    persona: "p",
    quote,
    vertical,
    intensity: "medium",
    willingness_to_pay: "none",
  };
}

describe("quotesMatch", () => {
  it("matches when one quote contains the other", () => {
    expect(quotesMatch("We still use spreadsheets. Every tool I tried is too expensive", "every tool I tried")).toBe(true);
  });

  it("matches mostly overlapping spans", () => {
    expect(quotesMatch("Every tool I tried is too expensive.", "tool I tried is too expensive and slow")).toBe(true);
  });

  it("does not match unrelated quotes or empty ones", () => {
    expect(quotesMatch("chasing late payments", "Every tool I tried is too expensive")).toBe(false);
    expect(quotesMatch("", "anything")).toBe(false);
  });
});

describe("scoreItem", () => {
  it("matches one-to-one and reports missed and extra pains", () => {
    const score = scoreItem(item, [
      extracted("every tool I tried is too expensive", "smb"),
      extracted("We still use spreadsheets"),
    ]);
    expect(score).toMatchObject({ expected: 2, extracted: 2, matched: 1, verticalCorrect: 0 });
    expect(score.missed.map((m) => m.quote)).toEqual(["chasing late payments eats my Fridays"]);
    expect(score.extra.map((e) => e.quote)).toEqual(["We still use spreadsheets"]);
  });

  it("does not count one extracted pain for two expected ones", () => {
    const score = scoreItem(
      { ...item, expected: [item.expected[0], item.expected[0]] },
      [extracted("Every tool I tried is too expensive")],
    );
    expect(score.matched).toBe(1);
  });
});

describe("summarize", () => {
  it("computes post and pain level metrics", () => {
    const noPain: LabeledEvalItem = { ...item, id: "2", expected: [] };
    const summary = summarize([
      scoreItem(item, [extracted("Every tool I tried is too expensive")]), // TP, 1/2 found
      scoreItem(noPain, [extracted("We still use spreadsheets")]), // FP
      scoreItem(noPain, []), // TN
      scoreItem(item, []), // FN
    ], 1);

    expect(summary.items).toBe(4);
    expect(summary.failed).toBe(1);
    expect(summary.post).toEqual({ precision: 0.5, recall: 0.5, accuracy: 0.5 });
    expect(summary.pain).toEqual({ precision: 0.5, recall: 0.25 });
    expect(summary.verticalAccuracy).toBe(1);
  });

  it("returns null ratios when there is nothing to divide by", () => {
    const summary = summarize([]);
    expect(summary.post.precision).toBeNull();
    expect(summary.pain.recall).toBeNull();
  });
});

describe("dataset", () => {
  it("round-trips through JSONL and skips blank lines", () => {
    const unlabeled: EvalItem = { ...item, id: "3", expected: null };
    const text = serializeDataset([item, unlabeled]);
    expect(parseDataset(`${text}\n\n`)).toEqual([item, unlabeled]);
  });

  it("reports the line of invalid entries", () => {
    expect(() => parseDataset(`${JSON.stringify(item)}\n{"id": 1}`)).toThrow("line 2");
  });
});

describe("labeling", () => {
  const items: EvalItem[] = [{ ...item, expected: null }, { ...item, id: "2", expected: [] }];

  it("stores the label and trims notes", () => {
    const pains = [{ quote: "late payments", vertical: "finance" as const }];
    const updated = applyLabel(items, item.id, pains, "  dudoso  ");
    expect(updated[0]).toMatchObject({ expected: pains, notes: "dudoso" });
    expect(items[0].expected).toBeNull();
  });

  it("rejects quotes that are not in the post and unknown items", () => {
    expect(() => applyLabel(items, item.id, [{ quote: "made up", vertical: "other" }])).toThrow(LabelError);
    expect(() => applyLabel(items, "nope", [])).toThrow(LabelError);
  });

  it("reports progress", () => {
    expect(labelingProgress(items)).toEqual({ total: 2, labeled: 1, withPains: 0, goal: 30 });
  });
});

describe("cost", () => {
  it("estimates known models and returns null for unknown ones", () => {
    const usage = sumUsage([
      { inputTokens: 500_000, outputTokens: 50_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { inputTokens: 500_000, outputTokens: 50_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 },
    ]);
    expect(estimateCost("claude-opus-5-5", usage)).toBeCloseTo(4 + 2 + 0.2);
    expect(estimateCost("some-other-model", usage)).toBeNull();
  });
});

describe("runEval", () => {
  it("scores every item, tracks failures and adds up cost", async () => {
    const failing: LabeledEvalItem = { ...item, id: "boom" };
    const extractor: PainExtractor = {
      model: "claude-haiku-5-5",
      async extract(input) {
        if ((input as LabeledEvalItem).id === "boom") throw new Error("API down");
        return {
          pains: [extracted("Every tool I tried is too expensive")],
          usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
        };
      },
    };

    const run = await runEval([item, failing], extractor, { concurrency: 2 });

    expect(run.summary).toMatchObject({ items: 1, failed: 1, pain: { recall: 0.5 } });
    expect(run.items.boom.error).toBe("API down");
    expect(run.usage.inputTokens).toBe(1000);
    expect(run.costUsd).toBeCloseTo((1000 * 0.1 + 100 * 0.5) / 1_000_000);
  });
});
