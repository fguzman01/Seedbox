import { parseArgs } from "node:util";
import { clusterPendingPains } from "../src/lib/cluster";
import { createClaudeClusterer } from "../src/lib/clustering";
import { createDb } from "../src/lib/db/client";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const { values } = parseArgs({
    options: {
      "batch-size": { type: "string", default: "20" },
      "max-batches": { type: "string", default: "10" },
    },
  });
  const clusterer = createClaudeClusterer();
  const { db, close } = createDb();
  try {
    const result = await clusterPendingPains(db, clusterer, {
      batchSize: Number(values["batch-size"]),
      maxBatches: Number(values["max-batches"]),
      onError: (ids, error) => console.error(`[pains ${ids.join(",")}] clustering failed:`, error),
    });
    console.log(
      `[${clusterer.model}] batches=${result.batches} assigned=${result.assigned} ` +
        `created=${result.created} unassigned=${result.unassigned} failed=${result.failed}`,
    );
    if (result.failed > 0 && result.assigned === 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
