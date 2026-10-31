import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

// Load .env when present; in a Claude Code environment the variables come from its settings.
try {
  process.loadEnvFile(".env");
} catch {}

/**
 * Client for the analyst API (H9, ADR-0008), used by the seedbox-analyst skill:
 *
 *   npm run agent -- status
 *   npm run agent -- work extract|cluster|assess [--limit N]   → writes .agent/<kind>.work.json
 *   npm run agent -- submit extract|cluster|assess <file>      → posts the results file
 */

const KINDS = ["extract", "cluster", "assess"];
const WORK_DIR = ".agent";

function usage(): never {
  console.error("Usage: npm run agent -- status | work <extract|cluster|assess> [--limit N] | submit <kind> <file>");
  process.exit(2);
}

async function call(pathAndQuery: string, init?: RequestInit) {
  const base = process.env.SEEDBOX_URL?.replace(/\/$/, "");
  if (!base) throw new Error("SEEDBOX_URL is not set (e.g. https://your-app.up.railway.app)");
  const headers = new Headers(init?.headers);
  const token = process.env.SEEDBOX_AGENT_TOKEN;
  // Without a token here, a network proxy may inject X-Seedbox-Agent-Token instead.
  if (token) headers.set("X-Seedbox-Agent-Token", token);
  const res = await fetch(`${base}${pathAndQuery}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  return body as Record<string, unknown>;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: "string" },
      model: { type: "string", default: process.env.SEEDBOX_AGENT_MODEL ?? "claude-code" },
    },
  });
  const [command, kind, file] = positionals;

  if (command === "status") {
    console.log(JSON.stringify(await call("/api/agent/work?kind=status"), null, 2));
    return;
  }

  if (command === "work") {
    if (!KINDS.includes(kind)) usage();
    const query = new URLSearchParams({ kind });
    if (values.limit) query.set("limit", values.limit);
    const work = await call(`/api/agent/work?${query}`);
    await mkdir(WORK_DIR, { recursive: true });
    const out = path.join(WORK_DIR, `${kind}.work.json`);
    await writeFile(out, JSON.stringify(work, null, 2) + "\n");
    const items = (work.items ?? work.pains ?? []) as unknown[];
    console.log(`${items.length} ${kind} item(s) written to ${out}`);
    return;
  }

  if (command === "submit") {
    if (!KINDS.includes(kind) || !file) usage();
    const results = JSON.parse(await readFile(file, "utf8"));
    const payload = { ...results, kind, model: values.model };
    const summary = await call("/api/agent/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
