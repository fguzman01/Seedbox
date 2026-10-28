"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { Note } from "@/lib/db/schema";
import { MAX_NOTE_LENGTH } from "@/lib/note-body";
import { createNote, removeNote } from "../opportunities/actions";

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

export function Notes({ opportunityId, notes }: { opportunityId: number; notes: Note[] }) {
  const [state, formAction, saving] = useActionState(createNote.bind(null, opportunityId), null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the textarea once a note was saved.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} className="space-y-2">
        <textarea
          name="body"
          required
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          placeholder="¿Qué piensas de esta oportunidad? Ideas, dudas, próximos pasos…"
          aria-label="Nueva nota"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Agregar nota"}
          </button>
          {state && !state.ok && <p className="text-sm text-red-400">{state.error}</p>}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-zinc-500">Aún no hay notas.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <NoteItem key={note.id} opportunityId={opportunityId} note={note} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteItem({ opportunityId, note }: { opportunityId: number; note: Note }) {
  const [deleting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm("¿Borrar esta nota?")) return;
    startTransition(async () => {
      const result = await removeNote(opportunityId, note.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className={`rounded-lg bg-zinc-900 p-3 transition-opacity ${deleting ? "opacity-50" : ""}`}>
      <p className="text-sm whitespace-pre-wrap text-zinc-200">{note.body}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
        {/* Server (UTC) and browser time zones differ; the browser's local time wins. */}
        <time dateTime={note.createdAt.toISOString()} suppressHydrationWarning>
          {dateFormat.format(note.createdAt)}
        </time>
        <button type="button" onClick={onDelete} disabled={deleting} className="hover:text-red-400">
          Borrar
        </button>
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </li>
  );
}
