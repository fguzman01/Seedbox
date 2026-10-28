import { count, desc, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { signals } from "./db/schema";

export async function getSignalStats() {
  const db = getDb();
  const [totals] = await db.select({ total: count() }).from(signals);
  const [pending] = await db
    .select({ pending: count() })
    .from(signals)
    .where(eq(signals.status, "pending"));
  return { total: totals.total, pending: pending.pending };
}

export async function getRecentSignals(limit = 20) {
  return getDb().select().from(signals).orderBy(desc(signals.publishedAt)).limit(limit);
}
