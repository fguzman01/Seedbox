import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db/client";

/**
 * Health check for the hosting platform (docs/deploy.md). Public on purpose: the proxy skips it,
 * and it reveals nothing beyond whether the app can reach its database.
 */
export async function GET() {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
