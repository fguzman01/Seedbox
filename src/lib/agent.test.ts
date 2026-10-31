import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  agentResultsSchema,
  clampLimit,
  getAgentStatus,
  getAssessWork,
  getClusterWork,
  getExtractWork,
  submitAgentResults,
} from "./agent";
import { checkAgentToken } from "./auth";
import { opportunities, pains, signals } from "./db/schema";
import type { ExtractedPain } from "./pains";
import { testDatabaseUrl, useTestDb } from "./test-db";

const pain = (quote: string): ExtractedPain => ({
  description: "Facturar es lento",
  persona: "agencias",
  quote,
  vertical: "freelance",
  intensity: "high",
  willingness_to_pay: "explicit",
});

describe("checkAgentToken", () => {
  const env = { SEEDBOX_AGENT_TOKEN: "s3cret-token" };

  it("is disabled (404) without a configured token", () => {
    expect(checkAgentToken({ authorization: "Bearer anything" }, {})).toEqual({ ok: false, status: 404 });
  });

  it("accepts the token as Bearer or in X-Seedbox-Agent-Token", () => {
    expect(checkAgentToken({ authorization: "Bearer s3cret-token" }, env)).toEqual({ ok: true });
    expect(checkAgentToken({ agentToken: "s3cret-token", authorization: "Basic abc" }, env)).toEqual({ ok: true });
  });

  it("rejects missing or wrong tokens (401)", () => {
    for (const headers of [{}, { authorization: "Bearer nope" }, { agentToken: "s3cret" }, { authorization: "s3cret-token" }]) {
      expect(checkAgentToken(headers, env)).toEqual({ ok: false, status: 401 });
    }
  });
});

describe("clampLimit and the results schema", () => {
  it("defaults and caps batch sizes", () => {
    expect(clampLimit("extract", undefined)).toBe(30);
    expect(clampLimit("extract", "500")).toBe(100);
    expect(clampLimit("assess", "-1")).toBe(5);
    expect(clampLimit("cluster", "12")).toBe(12);
  });

  it("rejects malformed payloads", () => {
    expect(agentResultsSchema.safeParse({ kind: "extract", results: [{ signalId: "x", pains: [] }] }).success).toBe(false);
    expect(agentResultsSchema.safeParse({ kind: "nope" }).success).toBe(false);
    expect(agentResultsSchema.safeParse({ kind: "extract", model: "bad model!", results: [] }).success).toBe(false);
    expect(agentResultsSchema.safeParse({ kind: "assess", results: [] }).success).toBe(true);
  });
});

describe.skipIf(!testDatabaseUrl)("agent work exchange (database)", () => {
  const db = useTestDb();

  async function seedSignal(externalId: string, body: string, status: "pending" | "processed" = "pending") {
    const [signal] = await db
      .insert(signals)
      .values({ source: "test", externalId, url: `https://example.com/${externalId}`, title: "Ask HN: invoices?", body, author: externalId, publishedAt: new Date(), status })
      .returning();
    return signal;
  }

  it("hands out pending posts with the extraction rules and stores verified pains", async () => {
    const a = await seedSignal("a", "Every invoicing tool is too expensive for us.");
    const b = await seedSignal("b", "Just sharing my side project.");
    const done = await seedSignal("c", "old", "processed");

    const work = await getExtractWork(db, 10);
    expect(work.rules).toContain("Evidence over opinion");
    expect(work.items.map((i) => i.id)).toEqual([a.id, b.id]);

    const summary = await submitAgentResults(db, {
      kind: "extract",
      results: [
        { signalId: a.id, pains: [pain("too expensive for us"), pain("an invented quote")] },
        { signalId: b.id, pains: [] },
        { signalId: done.id, pains: [pain("old")] },
        { signalId: 9999, pains: [] },
      ],
    });

    expect(summary).toEqual({
      kind: "extract",
      processed: 1,
      discarded: 1,
      droppedPains: 1,
      skipped: [
        { signalId: done.id, reason: "already processed" },
        { signalId: 9999, reason: "unknown signal" },
      ],
    });
    const stored = await db.select().from(pains);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ signalId: a.id, quote: "too expensive for us", model: "claude-code" });
    expect(await getAgentStatus(db)).toMatchObject({ extract: 0, cluster: 1 });
  });

  it("clusters with the same validation as the API pipeline", async () => {
    const s = await seedSignal("a", "body", "processed");
    const [existing] = await db.insert(opportunities).values({ title: "Facturación cara", summary: "…", model: "m" }).returning();
    const [p1, p2, p3] = await db
      .insert(pains)
      .values(["uno", "dos", "tres"].map((q) => ({ signalId: s.id, description: q, persona: "p", quote: q, vertical: "freelance" as const, intensity: "low" as const, willingnessToPay: "none" as const, model: "m" })))
      .returning();
    await db.update(pains).set({ opportunityId: existing.id }).where(eq(pains.id, p3.id));

    const work = await getClusterWork(db, 10);
    expect(work.pains.map((p) => p.id)).toEqual([p1.id, p2.id]);
    expect(work.catalog.map((o) => o.id)).toEqual([existing.id]);

    const summary = await submitAgentResults(db, {
      kind: "cluster",
      model: "claude-code",
      output: {
        new_opportunities: [{ ref: "n1", title: "Morosos", summary: "Cobrar cuesta." }],
        assignments: [
          { pain_id: p1.id, opportunity: `o${existing.id}` },
          { pain_id: p2.id, opportunity: "o424242" }, // invalid reference
          { pain_id: p3.id, opportunity: "n1" }, // already clustered: ignored
        ],
      },
    });

    expect(summary).toEqual({ kind: "cluster", assigned: 1, created: 0, invalid: [p2.id], ignored: [p3.id] });
    const [row1] = await db.select().from(pains).where(eq(pains.id, p1.id));
    expect(row1.opportunityId).toBe(existing.id);
    expect(await db.$count(opportunities)).toBe(1);
  });

  it("returns an empty cluster batch when everything is clustered", async () => {
    const work = await getClusterWork(db, 10);
    expect(work).toMatchObject({ kind: "cluster", pains: [], catalog: [] });
  });

  it("hands out opportunities to assess and stores normalized assessments", async () => {
    const s = await seedSignal("a", "body", "processed");
    const [o] = await db.insert(opportunities).values({ title: "Facturación", summary: "…", model: "m" }).returning();
    await db.insert(pains).values({ signalId: s.id, opportunityId: o.id, description: "d", persona: "p", quote: "q", vertical: "smb", intensity: "high", willingnessToPay: "none", model: "m" });

    const work = await getAssessWork(db, 5);
    expect(work.items.map((i) => [i.id, i.pains.length])).toEqual([[o.id, 1]]);

    const summary = await submitAgentResults(db, {
      kind: "assess",
      results: [
        {
          opportunityId: o.id,
          assessment: {
            competitors: [
              { name: "Real", url: "https://real.example", note: "Caro." },
              { name: "Sin link", url: "no-url", note: "…" },
            ],
            competition_score: 6.4,
            competition_rationale: " Hay opciones caras. ",
            buildability_score: 12,
            buildability_rationale: "Simple.",
          },
        },
        { opportunityId: 9999, assessment: { competitors: [], competition_score: 5, competition_rationale: "r", buildability_score: 5, buildability_rationale: "r" } },
      ],
    });

    expect(summary).toEqual({ kind: "assess", assessed: 1, skipped: [{ opportunityId: 9999, reason: "unknown opportunity" }] });
    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, o.id));
    expect(row).toMatchObject({
      competitionScore: 6,
      buildabilityScore: 10,
      competitionRationale: "Hay opciones caras.",
      competitors: [{ name: "Real", url: "https://real.example", note: "Caro." }],
      assessmentModel: "claude-code",
    });
    expect((await getAgentStatus(db)).assess).toBe(0);
  });
});
