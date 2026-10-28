import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDb } from "../src/lib/db/client";
import { DEFAULT_DATASET_PATH, loadDataset, saveDataset } from "../src/lib/eval/dataset";
import { sampleSignals } from "../src/lib/eval/sample";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const { values } = parseArgs({ options: { count: { type: "string", default: "40" } } });
  const items = await loadDataset();
  const { db, close } = createDb();
  try {
    const added = await sampleSignals(db, items, Number(values.count));
    await mkdir(path.dirname(DEFAULT_DATASET_PATH), { recursive: true });
    await saveDataset([...items, ...added]);
    console.log(`Added ${added.length} unlabeled posts to ${DEFAULT_DATASET_PATH}.`);
    console.log("Label them at http://localhost:3000/labeling (npm run dev).");
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
