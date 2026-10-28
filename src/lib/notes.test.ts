import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { assessPendingOpportunities } from "./assess";
import { opportunities, pains, signals } from "./db/schema";
import { addNote, deleteNote, getNotes, setStarred } from "./notes";
import { getOpportunities, getOpportunity } from "./queries";
import { DEFAULT_WEIGHTS } from "./scoring";
import { testDatabaseUrl, useTestDb } from "./test-db";

describe.skipIf(!testDatabaseUrl)("favorites and notes (database)", () => {
  const db = useTestDb();

  async function seedOpportunity(title = "Facturación") {
    const [opportunity] = await db.insert(opportunities).values({ title, summary: "…", model: "m" }).returning();
    const [signal] = await db
      .insert(signals)
      .values({ source: "test", externalId: title, url: "https://example.com", title: null, body: "b", author: "a", publishedAt: new Date() })
      .returning();
    await db.insert(pains).values({
      signalId: signal.id,
      opportunityId: opportunity.id,
      description: "d",
      persona: "p",
      quote: "q",
      vertical: "smb",
      intensity: "high",
      willingnessToPay: "none",
      model: "m",
    });
    return opportunity;
  }

  it("stars and unstars, keeping the original date when starred twice", async () => {
    const { id } = await seedOpportunity();

    expect(await setStarred(db, id, true)).toBe(true);
    const [first] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    expect(first.starredAt).toBeInstanceOf(Date);

    await setStarred(db, id, true);
    const [again] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    expect(again.starredAt).toEqual(first.starredAt);

    await setStarred(db, id, false);
    const [unstarred] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    expect(unstarred.starredAt).toBeNull();

    expect(await setStarred(db, 9999, true)).toBe(false);
  });

  it("adds notes newest first, trims them and rejects empty or oversized ones", async () => {
    const { id } = await seedOpportunity();
    await addNote(db, id, "  primera  ");
    await addNote(db, id, "segunda");

    expect((await getNotes(db, id)).map((n) => n.body)).toEqual(["segunda", "primera"]);
    await expect(addNote(db, id, "   ")).rejects.toThrow("vacía");
    await expect(addNote(db, id, "x".repeat(5001))).rejects.toThrow("5000");
  });

  it("deletes a note only from its own opportunity", async () => {
    const a = await seedOpportunity("a");
    const b = await seedOpportunity("b");
    const note = await addNote(db, a.id, "nota de a");

    expect(await deleteNote(db, b.id, note.id)).toBe(false);
    expect(await getNotes(db, a.id)).toHaveLength(1);
    expect(await deleteNote(db, a.id, note.id)).toBe(true);
    expect(await getNotes(db, a.id)).toHaveLength(0);
  });

  it("exposes favorites and note counts in the dashboard and detail queries", async () => {
    const starred = await seedOpportunity("con estrella");
    await seedOpportunity("sin estrella");
    await setStarred(db, starred.id, true);
    await addNote(db, starred.id, "uno");
    await addNote(db, starred.id, "dos");

    const list = await getOpportunities(DEFAULT_WEIGHTS, db);
    const byTitle = Object.fromEntries(list.map((o) => [o.title, o]));
    expect(byTitle["con estrella"]).toMatchObject({ noteCount: 2, painCount: 1 });
    expect(byTitle["con estrella"].starredAt).toBeInstanceOf(Date);
    expect(byTitle["sin estrella"]).toMatchObject({ noteCount: 0, starredAt: null });

    const detail = await getOpportunity(starred.id, DEFAULT_WEIGHTS, db);
    expect(detail?.notes.map((n) => n.body)).toEqual(["dos", "uno"]);
  });

  it("keeps favorites and notes when the opportunity is re-assessed", async () => {
    const { id } = await seedOpportunity();
    await setStarred(db, id, true);
    await addNote(db, id, "me interesa");

    await assessPendingOpportunities(db, {
      model: "fake",
      assess: async () => ({
        assessment: { competitionScore: 5, competitionRationale: "r", competitors: [], buildabilityScore: 5, buildabilityRationale: "r" },
      }),
    });

    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    expect(row.assessedAt).toBeInstanceOf(Date);
    expect(row.starredAt).toBeInstanceOf(Date);
    expect(await getNotes(db, id)).toHaveLength(1);
  });
});
