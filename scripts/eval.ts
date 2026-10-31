import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { isLabeled, loadDataset } from "../src/lib/eval/dataset";
import { runEval } from "../src/lib/eval/run";
import { createClaudeExtractor } from "../src/lib/extraction";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

const RESULTS_DIR = path.join("evals", "extraction", "results");

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)}%`);

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string", default: "4" },
    },
  });

  const labeled = (await loadDataset()).filter(isLabeled);
  const items = values.limit ? labeled.slice(0, Number(values.limit)) : labeled;
  if (items.length === 0) {
    console.error("No labeled posts. Run `npm run eval:sample` and label them at /labeling.");
    process.exitCode = 1;
    return;
  }

  const extractor = createClaudeExtractor({ model: values.model });
  console.log(`Evaluating ${extractor.model} on ${items.length} labeled posts…`);
  const run = await runEval(items, extractor, { concurrency: Number(values.concurrency) });
  const { summary } = run;

  console.log(`
Posts evaluated     ${summary.items} (failed: ${summary.failed})
Has pain? precision ${pct(summary.post.precision)}   recall ${pct(summary.post.recall)}   accuracy ${pct(summary.post.accuracy)}
Pains     precision ${pct(summary.pain.precision)}   recall ${pct(summary.pain.recall)}
Vertical  accuracy  ${pct(summary.verticalAccuracy)} (of matched pains)
Cost                ${run.costUsd === null ? "unknown model price" : `$${run.costUsd.toFixed(4)}`} (${run.usage.inputTokens} in / ${run.usage.outputTokens} out / ${run.usage.cacheReadTokens} cached)
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
  await writeFile(file, JSON.stringify(run, null, 2) + "\n");
  console.log(`\nFull results: ${file}`);
  if (summary.items === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
