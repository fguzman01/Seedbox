import { and, count, gte, max, ne } from "drizzle-orm";
import { getAgentStatus, WORK_KINDS, WORK_LIMITS, type WorkKind } from "./agent";
import type { Database } from "./db/client";
import { agentDeliveries, signals } from "./db/schema";

/**
 * State of the daily Claude Code analyst (H10): pending work per kind, last delivery per kind and
 * the 7-day balance of posts in vs posts out. Only counts and dates, never tokens or content.
 */

const HOUR_MS = 60 * 60 * 1000;

/** The analyst runs daily; more than a day and a half without a delivery means it stopped. */
export const STALE_AFTER_HOURS = 36;
export const BALANCE_DAYS = 7;

export type AnalystState = "never" | "running" | "stopped";

/** "never" when nothing was ever delivered, "stopped" past STALE_AFTER_HOURS. */
export function analystState(lastDeliveryAt: Date | null, now: Date): AnalystState {
  if (!lastDeliveryAt) return "never";
  return hoursSince(lastDeliveryAt, now) > STALE_AFTER_HOURS ? "stopped" : "running";
}

export function hoursSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / HOUR_MS;
}

/** The most recent of the per-kind deliveries, or null when there is none. */
export function latestDelivery(byKind: Record<WorkKind, Date | null>): Date | null {
  let latest: Date | null = null;
  for (const date of Object.values(byKind)) {
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

/** Start of the rolling balance window: exactly `days` × 24 hours before now. */
export function balanceWindowStart(now: Date, days = BALANCE_DAYS): Date {
  return new Date(now.getTime() - days * 24 * HOUR_MS);
}

export type QueueTrend = "growing" | "shrinking" | "steady";

export interface Balance {
  days: number;
  ingested: number;
  processed: number;
  /** Change in the pending queue over the window: positive means it grew. */
  net: number;
  trend: QueueTrend;
}

/** At the window's pace, the extraction queue grows when more posts come in than get processed. */
export function summarizeBalance(ingested: number, processed: number, days = BALANCE_DAYS): Balance {
  const net = ingested - processed;
  return { days, ingested, processed, net, trend: net > 0 ? "growing" : net < 0 ? "shrinking" : "steady" };
}

/** Pending assess work is counted up to the batch maximum (see getAgentStatus). */
export function isCapped(kind: WorkKind, pending: number): boolean {
  return kind === "assess" && pending >= WORK_LIMITS.assess.max;
}

export async function getLastDeliveries(db: Database): Promise<Record<WorkKind, Date | null>> {
  const rows = await db
    .select({ kind: agentDeliveries.kind, at: max(agentDeliveries.receivedAt) })
    .from(agentDeliveries)
    .groupBy(agentDeliveries.kind);
  const byKind = Object.fromEntries(WORK_KINDS.map((k) => [k, null])) as Record<WorkKind, Date | null>;
  for (const row of rows) byKind[row.kind] = row.at;
  return byKind;
}

export async function getLastDeliveryAt(db: Database): Promise<Date | null> {
  const [row] = await db.select({ at: max(agentDeliveries.receivedAt) }).from(agentDeliveries);
  return row?.at ?? null;
}

/**
 * Posts in: signals fetched within the window. Posts out ("processed"): signals whose extraction
 * finished within the window, i.e. status "processed" (has pains) or "discarded" (no pains),
 * by `processed_at`, whoever ran the extraction (analyst or API pipeline).
 */
export async function getBalance(db: Database, now: Date, days = BALANCE_DAYS): Promise<Balance> {
  const since = balanceWindowStart(now, days);
  const [[ingested], [processed]] = await Promise.all([
    db.select({ n: count() }).from(signals).where(gte(signals.fetchedAt, since)),
    db
      .select({ n: count() })
      .from(signals)
      .where(and(ne(signals.status, "pending"), gte(signals.processedAt, since))),
  ]);
  return summarizeBalance(ingested.n, processed.n, days);
}

export async function getAnalystStatus(db: Database, now = new Date()) {
  const [pending, lastDeliveries, balance] = await Promise.all([
    getAgentStatus(db),
    getLastDeliveries(db),
    getBalance(db, now),
  ]);
  const lastDeliveryAt = latestDelivery(lastDeliveries);
  return {
    kinds: WORK_KINDS.map((kind) => ({
      kind,
      pending: pending[kind],
      capped: isCapped(kind, pending[kind]),
      lastDeliveryAt: lastDeliveries[kind],
    })),
    lastDeliveryAt,
    state: analystState(lastDeliveryAt, now),
    balance,
  };
}

export type AnalystStatus = Awaited<ReturnType<typeof getAnalystStatus>>;

/** "hace 3 h", "hace 2 días": how long ago something happened, in Spanish for the UI. */
export function formatAge(date: Date, now: Date): string {
  const hours = hoursSince(date, now);
  if (hours < 1) return "hace menos de 1 h";
  if (hours < 48) return `hace ${Math.floor(hours)} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}
