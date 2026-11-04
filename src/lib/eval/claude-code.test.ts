import { describe, expect, it } from "vitest";
import { EXTRACTION_RULES } from "../extraction";
import type { ExtractedPain } from "../pains";
import {
  buildEvalWork,
  CLAUDE_CODE_MODEL,
  createResultsExtractor,
  EvalResultsError,
  parseEvalResults,
  unknownResultIds,
} from "./claude-code";
import type { LabeledEvalItem } from "./dataset";
import { runEval } from "./run";

const invoices: LabeledEvalItem = {
  id: "hackernews:1",
  source: "hackernews",
  url: "https://news.ycombinator.com/item?id=1",
  title: "Ask HN: How do you manage invoices?",
  body: "We still use spreadsheets. Every tool I tried is too expensive. Also, chasing late payments eats my Fridays.",
  expected: [
    { quote: "Every tool I tried is too expensive", vertical: "freelance" },
    { quote: "chasing late payments eats my Fridays", vertical: "finance" },
  ],
  notes: "secret labeler note",
};

const launch: LabeledEvalItem = {
  id: "hackernews:2",
  source: "hackernews",
  url: "https://news.ycombinator.com/item?id=2",
  title: "Show HN: My new static site generator",
  body: "I built this over the weekend, feedback welcome.",
  expected: [],
};

const unanswered: LabeledEvalItem = {
  id: "reddit:abc",
  source: "reddit",
  url: "https://reddit.com/abc",
  title: null,
  body: "Our scheduling tool double-books rooms every week.",
  expected: [{ quote: "double-books rooms every week", vertical: "smb" }],
};

function pain(quote: string, vertical: ExtractedPain["vertical"] = "freelance"): ExtractedPain {
  return { description: "d", persona: "p", quote, vertical, intensity: "medium", willingness_to_pay: "none" };
}

describe("buildEvalWork", () => {
  it("uses the analyst's extract work format, keyed by dataset id, without labels", () => {
    const work = buildEvalWork([invoices, launch]);
    expect(work.kind).toBe("extract");
    expect(work.rules).toBe(EXTRACTION_RULES);
    expect(work.items).toEqual([
      { id: "hackernews:1", source: "hackernews", url: invoices.url, title: invoices.title, body: invoices.body },
      { id: "hackernews:2", source: "hackernews", url: launch.url, title: launch.title, body: launch.body },
    ]);
    const serialized = JSON.stringify(work);
    expect(serialized).not.toContain("expected");
    expect(serialized).not.toContain("secret labeler note");
  });
});

describe("parseEvalResults", () => {
  it("maps results by dataset id", () => {
    const results = parseEvalResults(
      JSON.stringify({
        results: [
          { signalId: "hackernews:1", pains: [pain("Every tool I tried is too expensive")] },
          { signalId: "hackernews:2", pains: [] },
        ],
      }),
    );
    expect([...results.keys()]).toEqual(["hackernews:1", "hackernews:2"]);
    expect(results.get("hackernews:1")![0].quote).toBe("Every tool I tried is too expensive");
  });

  it("rejects invalid JSON, invalid pains and duplicated ids", () => {
    expect(() => parseEvalResults("{")).toThrow(EvalResultsError);
    expect(() =>
      parseEvalResults(JSON.stringify({ results: [{ signalId: "hackernews:1", pains: [{ quote: "x" }] }] })),
    ).toThrow(/results\.0\.pains\.0/);
    expect(() =>
      parseEvalResults(
        JSON.stringify({
          results: [
            { signalId: "hackernews:1", pains: [] },
            { signalId: "hackernews:1", pains: [] },
          ],
        }),
      ),
    ).toThrow(/Duplicated result for hackernews:1/);
  });

  it("lists result ids that are not in the evaluated set", () => {
    const results = parseEvalResults(
      JSON.stringify({ results: [{ signalId: "hackernews:1", pains: [] }, { signalId: "hackernews:999", pains: [] }] }),
    );
    expect(unknownResultIds(results, [invoices, launch])).toEqual(["hackernews:999"]);
  });
});

describe("createResultsExtractor", () => {
  it("drops pains whose quote is not verbatim in the post and records them", async () => {
    const invented = pain("All invoicing apps are scams");
    const extractor = createResultsExtractor(
      new Map([["hackernews:1", [pain("Every tool I tried is too expensive"), invented]]]),
    );
    const { pains } = await extractor.extract(invoices);
    expect(pains.map((p) => p.quote)).toEqual(["Every tool I tried is too expensive"]);
    expect(extractor.unverified).toEqual({ "hackernews:1": [invented] });
    expect(extractor.model).toBe(CLAUDE_CODE_MODEL);
  });

  it("fails for posts without a result", async () => {
    const extractor = createResultsExtractor(new Map());
    await expect(extractor.extract(invoices)).rejects.toThrow("No result for this post");
  });
});

describe("runEval with Claude Code results", () => {
  it("scores the results, counts missing posts as failed and reports no cost or latency", async () => {
    const results = new Map<string, ExtractedPain[]>([
      [
        "hackernews:1",
        [
          pain("Every tool I tried is too expensive", "freelance"),
          pain("chasing late payments", "smb"),
          pain("Invoices are a nightmare for everyone"), // not in the post: dropped
        ],
      ],
      ["hackernews:2", [pain("feedback welcome", "devtools")]],
    ]);
    const extractor = createResultsExtractor(results);
    const run = await runEval([invoices, launch, unanswered], extractor, { measureLatency: false });

    expect(run.model).toBe("claude-code");
    expect(run.costUsd).toBeNull();
    expect(run.avgLatencyMs).toBeNull();
    expect(run.items["hackernews:1"].latencyMs).toBeNull();

    expect(run.items["reddit:abc"].error).toBe("No result for this post");
    expect(run.summary.failed).toBe(1);
    expect(run.summary.items).toBe(2);

    // hackernews:1: 2 of 2 expected pains found (1 with the right vertical); hackernews:2: 1 false positive.
    expect(run.summary.pain.precision).toBeCloseTo(2 / 3);
    expect(run.summary.pain.recall).toBe(1);
    expect(run.summary.post.precision).toBe(0.5);
    expect(run.summary.post.recall).toBe(1);
    expect(run.summary.verticalAccuracy).toBe(0.5);
    expect(extractor.unverified["hackernews:1"].map((p) => p.quote)).toEqual([
      "Invoices are a nightmare for everyone",
    ]);
  });
});
