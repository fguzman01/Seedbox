import { parseArgs } from "node:util";
import { createDb } from "../src/lib/db/client";
import { createClaudeExtractor } from "../src/lib/extraction";
import { processPendingSignals } from "../src/lib/process";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", default: "50" },
      concurrency: { type: "string", default: "4" },
    },
  });
  const extractor = createClaudeExtractor();
  const { db, close } = createDb();
  try {
    const result = await processPendingSignals(db, extractor, {
      limit: Number(values.limit),
      concurrency: Number(values.concurrency),
      onError: (signal, error) => console.error(`[signal ${signal.id}] extraction failed:`, error),
    });
    console.log(
      `[${extractor.model}] processed=${result.processed} discarded=${result.discarded} ` +
        `failed=${result.failed} pains=${result.pains}`,
    );
    if (result.failed > 0 && result.processed + result.discarded === 0) {
      process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
