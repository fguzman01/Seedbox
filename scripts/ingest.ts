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
    for (const id of targets) {
      const result = await ingest(db, getSource(id));
      console.log(`[${result.source}] fetched=${result.fetched} inserted=${result.inserted}`);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
