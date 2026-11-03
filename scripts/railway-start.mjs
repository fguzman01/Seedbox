// Entry point for every Railway service (docs/deploy.md). Railway applies railway.json to all
// services built from this repo, so each service picks its role with SEEDBOX_SERVICE:
//   unset or "web" → apply migrations, then serve the site
//   "ingest"       → apply migrations, then run one ingestion and exit (cron service)
//   "pipeline"     → same, with the full Claude API pipeline instead (pay-per-use alternative)
import { spawn } from "node:child_process";

// Binaries are called directly, not through `npm run`: npm does not pass SIGTERM on to the
// process below it, so the site would keep running when the platform stops it.
const bin = (name) => `node_modules/.bin/${name}`;
const MIGRATE = [process.execPath, ["scripts/migrate.mjs"]];
const ROLES = {
  web: [bin("next"), ["start"]],
  ingest: [bin("tsx"), ["scripts/ingest.ts"]],
  pipeline: [bin("tsx"), ["scripts/pipeline.ts"]],
};

const role = process.env.SEEDBOX_SERVICE?.trim() || "web";
if (!ROLES[role]) {
  console.error(`Unknown SEEDBOX_SERVICE "${role}". Use one of: ${Object.keys(ROLES).join(", ")}`);
  process.exit(1);
}

/** Runs a command with inherited output; forwards shutdown signals so the platform can stop it. */
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    const forward = (signal) => child.kill(signal);
    process.on("SIGTERM", forward);
    process.on("SIGINT", forward);
    child.on("exit", (code, signal) => {
      process.off("SIGTERM", forward);
      process.off("SIGINT", forward);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

console.log(`[seedbox] starting as "${role}"`);
const migrated = await run(...MIGRATE);
if (migrated !== 0) process.exit(migrated);
process.exit(await run(...ROLES[role]));
