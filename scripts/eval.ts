import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  buildEvalWork,
  createResultsExtractor,
  parseEvalResults,
  unknownResultIds,
} from "../src/lib/eval/claude-code";
import { isLabeled, loadDataset } from "../src/lib/eval/dataset";
import { runEval, type EvalRun } from "../src/lib/eval/run";
import { createClaudeExtractor } from "../src/lib/extraction";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

/**
 *   npm run eval [-- --model M] [--limit N] [--concurrency N]   → Claude API
 *   npm run eval -- --export [--out .agent/eval.work.json] [--limit N]
 *       → writes the labeled posts, without labels, in the analyst's extract work format
 *   npm run eval -- --from-results <file> [--limit N]
 *       → scores Claude Code results (extract.results.json format, signalId = dataset id)
 */

const RESULTS_DIR = path.join("evals", "extraction", "results");
const DEFAULT_WORK_FILE = path.join(".agent", "eval.work.json");

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)}%`);

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string", default: "4" },
      export: { type: "boolean", default: false },
      out: { type: "string", default: DEFAULT_WORK_FILE },
      "from-results": { type: "string" },
    },
  });
  const fromResults = values["from-results"];
  if (values.export && fromResults) {
    console.error("Use either --export or --from-results, not both.");
    process.exitCode = 2;
    return;
  }

  const labeled = (await loadDataset()).filter(isLabeled);
  const items = values.limit ? labeled.slice(0, Number(values.limit)) : labeled;
  if (items.length === 0) {
    console.error("No labeled posts. Run `npm run eval:sample` and label them at /labeling.");
    process.exitCode = 1;
    return;
  }

  if (values.export) {
    await mkdir(path.dirname(values.out), { recursive: true });
    await writeFile(values.out, JSON.stringify(buildEvalWork(items), null, 2) + "\n");
    console.log(`${items.length} labeled post(s) written, without labels, to ${values.out}`);
    return;
  }

  let run: EvalRun;
  let extra: Record<string, unknown> = {};
  if (fromResults) {
    const results = parseEvalResults(await readFile(fromResults, "utf8"));
    const extractor = createResultsExtractor(results);
    console.log(`Scoring ${extractor.model} results from ${fromResults} on ${items.length} labeled posts…`);
    run = await runEval(items, extractor, { measureLatency: false });
    const unknown = unknownResultIds(results, items);
    const unverifiedCount = Object.values(extractor.unverified).reduce((n, pains) => n + pains.length, 0);
    console.log(`Unverified quotes   ${unverifiedCount} pain(s) dropped (quote not verbatim in the post)`);
    for (const [id, pains] of Object.entries(extractor.unverified)) {
      for (const pain of pains) console.log(`  ${id}: "${pain.quote}"`);
    }
    if (unknown.length) console.log(`Ignored results     ${unknown.length} with unknown id: ${unknown.join(", ")}`);
    extra = { resultsFile: fromResults, unverifiedPains: extractor.unverified, unknownResultIds: unknown };
  } else {
    const extractor = createClaudeExtractor({ model: values.model });
    console.log(`Evaluating ${extractor.model} on ${items.length} labeled posts…`);
    run = await runEval(items, extractor, { concurrency: Number(values.concurrency) });
  }
  const { summary } = run;

  console.log(`
Posts evaluated     ${summary.items} (failed: ${summary.failed})
Has pain? precision ${pct(summary.post.precision)}   recall ${pct(summary.post.recall)}   accuracy ${pct(summary.post.accuracy)}
Pains     precision ${pct(summary.pain.precision)}   recall ${pct(summary.pain.recall)}
Vertical  accuracy  ${pct(summary.verticalAccuracy)} (of matched pains)
Cost                ${run.costUsd === null ? (fromResults ? "— (subscription)" : "unknown model price") : `$${run.costUsd.toFixed(4)}`} (${run.usage.inputTokens} in / ${run.usage.outputTokens} out / ${run.usage.cacheReadTokens} cached)
Avg latency         ${run.avgLatencyMs === null ? "—" : `${(run.avgLatencyMs / 1000).toFixed(1)}s`}`);

  for (const [id, item] of Object.entries(run.items)) {
    if (item.error) console.log(`\n✗ ${id}: ${item.error}`);
    else if (item.score && (item.score.missed.length || item.score.extra.length)) {
      console.log(`\n• ${id}`);
      for (const m of item.score.missed) console.log(`  missed: "${m.quote}"`);
      for (const e of item.score.extra) console.log(`  extra:  "${e.quote}" — ${e.description}`);
    }
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${run.startedAt.replace(/[:.]/g, "-")}-${run.model}.json`);
  await writeFile(file, JSON.stringify({ ...run, ...extra }, null, 2) + "\n");
  console.log(`\nFull results: ${file}`);
  if (summary.items === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
