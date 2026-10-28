"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { checkWriteAccess } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { noteBodySchema } from "@/lib/note-body";
import { addNote, deleteNote, setStarred } from "@/lib/notes";

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.number().int().positive();

/** Every action re-checks access instead of relying on the proxy alone (ADR-0007). */
async function denied(): Promise<ActionResult | null> {
  const access = checkWriteAccess((await headers()).get("authorization"));
  return access.allowed ? null : { ok: false, error: access.reason };
}

export async function toggleStar(opportunityId: number, starred: boolean): Promise<ActionResult> {
  const blocked = await denied();
  if (blocked) return blocked;
  if (!idSchema.safeParse(opportunityId).success || typeof starred !== "boolean") {
    return { ok: false, error: "Datos inválidos." };
  }
  if (!(await setStarred(getDb(), opportunityId, starred))) {
    return { ok: false, error: "La oportunidad no existe." };
  }
  refresh();
  return { ok: true };
}

/** Bound to the opportunity id and used with useActionState. */
export async function createNote(
  opportunityId: number,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = await denied();
  if (blocked) return blocked;
  if (!idSchema.safeParse(opportunityId).success) return { ok: false, error: "Datos inválidos." };
  const body = noteBodySchema.safeParse(formData.get("body") ?? "");
  if (!body.success) return { ok: false, error: body.error.issues[0].message };

  try {
    await addNote(getDb(), opportunityId, body.data);
  } catch {
    return { ok: false, error: "No se pudo guardar la nota." };
  }
  refresh();
  return { ok: true };
}

export async function removeNote(opportunityId: number, noteId: number): Promise<ActionResult> {
  const blocked = await denied();
  if (blocked) return blocked;
  if (!idSchema.safeParse(opportunityId).success || !idSchema.safeParse(noteId).success) {
    return { ok: false, error: "Datos inválidos." };
  }
  if (!(await deleteNote(getDb(), opportunityId, noteId))) {
    return { ok: false, error: "La nota no existe." };
  }
  refresh();
  return { ok: true };
}
