import { parseArgs } from "node:util";
import { assessPendingOpportunities } from "../src/lib/assess";
import { createClaudeAssessor } from "../src/lib/assessment";
import { createDb } from "../src/lib/db/client";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", default: "10" },
      "max-age-days": { type: "string", default: "30" },
      "no-web-search": { type: "boolean", default: false },
    },
  });
  const assessor = createClaudeAssessor({ webSearch: !values["no-web-search"] });
  const { db, close } = createDb();
  try {
    const result = await assessPendingOpportunities(db, assessor, {
      limit: Number(values.limit),
      maxAgeDays: Number(values["max-age-days"]),
      onError: (id, error) => console.error(`[opportunity ${id}] assessment failed:`, error),
    });
    console.log(`[${assessor.model}] assessed=${result.assessed} failed=${result.failed}`);
    if (result.failed > 0 && result.assessed === 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
