import { createDb } from "../src/lib/db/client";
import { errorMessage, ingestAndRecord } from "../src/lib/ingest";
import { SOURCE_IDS } from "../src/lib/sources";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const ids = process.argv.slice(2);
  const targets = ids.length > 0 ? ids : SOURCE_IDS;
  const { db, close } = createDb();
  try {
    // One failing source (API down) must not stop the others. When ingesting every source, an
    // optional one without credentials is skipped rather than counted as a failure.
    // Every run is recorded per source (H14), so the site can show a skipped source as "not configured".
    for (const id of targets) {
      let result;
      try {
        result = await ingestAndRecord(db, id);
      } catch (error) {
        // Recording the run failed (database down).
        console.error(`[${id}] failed: ${errorMessage(error)}`);
        process.exitCode = 1;
        continue;
      }
      if (result.status === "ok") {
        console.log(`[${result.source}] fetched=${result.fetched} inserted=${result.inserted}`);
      } else if (result.status === "skipped" && ids.length === 0) {
        console.warn(`[${id}] skipped: ${errorMessage(result.error)}`);
      } else {
        console.error(`[${id}] failed: ${errorMessage(result.error)}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
