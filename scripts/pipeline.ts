import { parseArgs } from "node:util";
import { assessPendingOpportunities } from "../src/lib/assess";
import { createClaudeAssessor } from "../src/lib/assessment";
import { clusterPendingPains } from "../src/lib/cluster";
import { createClaudeClusterer } from "../src/lib/clustering";
import { createDb } from "../src/lib/db/client";
import { createClaudeExtractor } from "../src/lib/extraction";
import { ingest } from "../src/lib/ingest";
import { processPendingSignals } from "../src/lib/process";
import { getSource, SOURCE_IDS } from "../src/lib/sources";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

/**
 * The daily job: ingest → extract → cluster → assess (docs/deploy.md).
 * Each step runs even if an earlier one partly failed, so one broken source or a flaky API call
 * does not stop the rest; the exit code is non-zero if anything failed.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      "extract-limit": { type: "string", default: process.env.PIPELINE_EXTRACT_LIMIT ?? "100" },
      "assess-limit": { type: "string", default: process.env.PIPELINE_ASSESS_LIMIT ?? "10" },
      "no-web-search": { type: "boolean", default: false },
    },
  });
  const { db, close } = createDb();
  let failed = false;
  const log = (step: string, message: string) => console.log(`[${step}] ${message}`);
  const fail = (step: string, error: unknown) => {
    failed = true;
    console.error(`[${step}] failed:`, error instanceof Error ? error.message : error);
  };

  try {
    for (const id of SOURCE_IDS) {
      try {
        const result = await ingest(db, getSource(id));
        log("ingest", `${id}: fetched=${result.fetched} inserted=${result.inserted}`);
      } catch (error) {
        fail(`ingest ${id}`, error);
      }
    }

    try {
      const result = await processPendingSignals(db, createClaudeExtractor(), {
        limit: Number(values["extract-limit"]),
        onError: (signal, error) => fail(`extract signal ${signal.id}`, error),
      });
      log("extract", `processed=${result.processed} discarded=${result.discarded} failed=${result.failed} pains=${result.pains}`);
    } catch (error) {
      fail("extract", error);
    }

    try {
      const result = await clusterPendingPains(db, createClaudeClusterer(), {
        onError: (ids, error) => fail(`cluster pains ${ids.join(",")}`, error),
      });
      log("cluster", `assigned=${result.assigned} created=${result.created} unassigned=${result.unassigned} failed=${result.failed}`);
    } catch (error) {
      fail("cluster", error);
    }

    try {
      const result = await assessPendingOpportunities(
        db,
        createClaudeAssessor({ webSearch: !values["no-web-search"] }),
        {
          limit: Number(values["assess-limit"]),
          onError: (id, error) => fail(`assess opportunity ${id}`, error),
        },
      );
      log("assess", `assessed=${result.assessed} failed=${result.failed}`);
    } catch (error) {
      fail("assess", error);
    }
  } finally {
    await close();
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
