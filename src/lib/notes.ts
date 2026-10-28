import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { notes, opportunities } from "./db/schema";
import { noteBodySchema } from "./note-body";

/** Favorites and notes (H7). Every function takes the database so it can be tested directly. */

/** Returns false when the opportunity does not exist. */
export async function setStarred(db: Database, opportunityId: number, starred: boolean): Promise<boolean> {
  const updated = await db
    .update(opportunities)
    .set({ starredAt: starred ? sql`coalesce(${opportunities.starredAt}, now())` : null })
    .where(eq(opportunities.id, opportunityId))
    .returning({ id: opportunities.id });
  return updated.length > 0;
}

export async function addNote(db: Database, opportunityId: number, body: string) {
  const [note] = await db
    .insert(notes)
    .values({ opportunityId, body: noteBodySchema.parse(body) })
    .returning();
  return note;
}

/** Deletes a note only if it belongs to the given opportunity. */
export async function deleteNote(db: Database, opportunityId: number, noteId: number): Promise<boolean> {
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.opportunityId, opportunityId)))
    .returning({ id: notes.id });
  return deleted.length > 0;
}

export async function getNotes(db: Database, opportunityId: number) {
  return db
    .select()
    .from(notes)
    .where(eq(notes.opportunityId, opportunityId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}
