import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deliveryCounts, submitAgentResults } from "./agent";
import {
  analystState,
  balanceWindowStart,
  formatAge,
  getAnalystStatus,
  getBalance,
  getLastDeliveries,
  getLastDeliveryAt,
  isCapped,
  latestDelivery,
  summarizeBalance,
} from "./analyst-status";
import { agentDeliveries, signals } from "./db/schema";
import { testDatabaseUrl, useTestDb } from "./test-db";

const now = new Date("2026-11-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("analystState", () => {
  it("is 'never' without deliveries", () => {
    expect(analystState(null, now)).toBe("never");
  });

  it("is running up to 36 hours and stopped after that", () => {
    expect(analystState(hoursAgo(1), now)).toBe("running");
    expect(analystState(hoursAgo(36), now)).toBe("running");
    expect(analystState(hoursAgo(36.01), now)).toBe("stopped");
    expect(analystState(hoursAgo(24 * 5), now)).toBe("stopped");
  });
});

describe("latestDelivery", () => {
  it("picks the most recent kind, ignoring kinds never delivered", () => {
    expect(latestDelivery({ extract: hoursAgo(5), cluster: null, assess: hoursAgo(2) })).toEqual(hoursAgo(2));
    expect(latestDelivery({ extract: null, cluster: null, assess: null })).toBeNull();
  });
});

describe("7-day balance", () => {
  it("uses a rolling window of exactly 7 × 24 hours", () => {
    expect(balanceWindowStart(now)).toEqual(new Date("2026-10-28T12:00:00Z"));
    expect(balanceWindowStart(now, 1)).toEqual(new Date("2026-11-03T12:00:00Z"));
  });

  it("says the queue grows when more posts come in than get processed", () => {
    expect(summarizeBalance(80, 60)).toEqual({ days: 7, ingested: 80, processed: 60, net: 20, trend: "growing" });
  });

  it("says the queue shrinks when more posts get processed than come in", () => {
    expect(summarizeBalance(40, 60)).toMatchObject({ net: -20, trend: "shrinking" });
  });

  it("says the queue is steady when both match, including an idle week", () => {
    expect(summarizeBalance(30, 30).trend).toBe("steady");
    expect(summarizeBalance(0, 0).trend).toBe("steady");
  });
});

describe("isCapped and formatAge", () => {
  it("marks the assess count as capped at the batch maximum", () => {
    expect(isCapped("assess", 20)).toBe(true);
    expect(isCapped("assess", 19)).toBe(false);
    expect(isCapped("extract", 500)).toBe(false);
  });

  it("formats ages in hours, then days", () => {
    expect(formatAge(hoursAgo(0.5), now)).toBe("hace menos de 1 h");
    expect(formatAge(hoursAgo(5.9), now)).toBe("hace 5 h");
    expect(formatAge(hoursAgo(47), now)).toBe("hace 47 h");
    expect(formatAge(hoursAgo(73), now)).toBe("hace 3 días");
  });
});

describe("deliveryCounts", () => {
  it("counts submitted entries and the ones stored", () => {
    expect(
      deliveryCounts({ kind: "extract", processed: 2, discarded: 1, droppedPains: 4, skipped: [{ signalId: 9, reason: "x" }] }),
    ).toEqual({ items: 4, accepted: 3 });
    expect(deliveryCounts({ kind: "cluster", assigned: 3, created: 1, invalid: [7], ignored: [8, 9] })).toEqual({
      items: 6,
      accepted: 3,
    });
    expect(deliveryCounts({ kind: "assess", assessed: 1, skipped: [] })).toEqual({ items: 1, accepted: 1 });
  });
});

describe.skipIf(!testDatabaseUrl)("analyst status (database)", () => {
  const db = useTestDb();

  async function seedSignal(
    externalId: string,
    { fetchedAt, status = "pending", processedAt }: { fetchedAt: Date; status?: "pending" | "processed" | "discarded"; processedAt?: Date },
  ) {
    await db.insert(signals).values({
      source: "test",
      externalId,
      url: `https://example.com/${externalId}`,
      body: "body",
      publishedAt: fetchedAt,
      fetchedAt,
      status,
      processedAt,
    });
  }

  it("records each submission as a delivery with its counts", async () => {
    expect(await getLastDeliveryAt(db)).toBeNull();
    await submitAgentResults(db, { kind: "extract", results: [{ signalId: 9999, pains: [] }] });
    await submitAgentResults(db, { kind: "assess", results: [] });

    const rows = await db.select().from(agentDeliveries).orderBy(agentDeliveries.id);
    expect(rows.map((r) => [r.kind, r.items, r.accepted])).toEqual([
      ["extract", 1, 0],
      ["assess", 0, 0],
    ]);
    const last = await getLastDeliveries(db);
    expect(last.extract).toBeInstanceOf(Date);
    expect(last.cluster).toBeNull();
    expect(await getLastDeliveryAt(db)).toEqual(last.assess);
  });

  it("counts posts in and posts out within the last 7 days", async () => {
    await seedSignal("new-pending", { fetchedAt: hoursAgo(2) });
    await seedSignal("new-processed", { fetchedAt: hoursAgo(30), status: "processed", processedAt: hoursAgo(10) });
    await seedSignal("old-discarded", { fetchedAt: hoursAgo(24 * 10), status: "discarded", processedAt: hoursAgo(20) });
    await seedSignal("old-processed", { fetchedAt: hoursAgo(24 * 10), status: "processed", processedAt: hoursAgo(24 * 8) });

    expect(await getBalance(db, now)).toEqual({ days: 7, ingested: 2, processed: 2, net: 0, trend: "steady" });
  });

  it("reports pending work, last delivery per kind and the stopped state", async () => {
    await seedSignal("a", { fetchedAt: hoursAgo(1) });
    await db.insert(agentDeliveries).values([
      { kind: "extract", items: 30, accepted: 30, receivedAt: hoursAgo(50) },
      { kind: "extract", items: 30, accepted: 28, receivedAt: hoursAgo(40) },
      { kind: "cluster", items: 10, accepted: 10, receivedAt: hoursAgo(45) },
    ]);

    const status = await getAnalystStatus(db, now);
    expect(status.kinds).toEqual([
      { kind: "extract", pending: 1, capped: false, lastDeliveryAt: hoursAgo(40) },
      { kind: "cluster", pending: 0, capped: false, lastDeliveryAt: hoursAgo(45) },
      { kind: "assess", pending: 0, capped: false, lastDeliveryAt: null },
    ]);
    expect(status.lastDeliveryAt).toEqual(hoursAgo(40));
    expect(status.state).toBe("stopped");
    expect(status.balance).toMatchObject({ ingested: 1, processed: 0, trend: "growing" });

    await db.execute(sql`update agent_deliveries set received_at = now()`);
    expect((await getAnalystStatus(db)).state).toBe("running");
  });
});
