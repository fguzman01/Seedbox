import { createDb } from "../src/lib/db/client";
import { ingest } from "../src/lib/ingest";
import { getSource, SOURCE_IDS } from "../src/lib/sources";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const ids = process.argv.slice(2);
  const targets = ids.length > 0 ? ids : SOURCE_IDS;
  const { db, close } = createDb();
  try {
    // One failing source (missing credentials, API down) must not stop the others.
    for (const id of targets) {
      try {
        const result = await ingest(db, getSource(id));
        console.log(`[${result.source}] fetched=${result.fetched} inserted=${result.inserted}`);
      } catch (error) {
        console.error(`[${id}] failed: ${error instanceof Error ? error.message : error}`);
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
