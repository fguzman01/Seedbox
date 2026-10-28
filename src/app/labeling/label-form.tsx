"use client";

import { useRef, useState, useTransition } from "react";
import type { EvalItem, ExpectedPain } from "@/lib/eval/dataset";
import { VERTICAL_LABELS, VERTICALS, type Vertical } from "@/lib/pains";
import { saveLabel } from "./actions";

export function LabelForm({ item }: { item: EvalItem }) {
  const [pains, setPains] = useState<ExpectedPain[]>(item.expected ?? []);
  const [vertical, setVertical] = useState<Vertical>("smb");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const postRef = useRef<HTMLDivElement>(null);

  function addSelection() {
    const selection = window.getSelection();
    const quote = selection?.toString().trim() ?? "";
    if (!quote || !selection?.anchorNode || !postRef.current?.contains(selection.anchorNode)) {
      setError("Selecciona en el post el texto que muestra el dolor.");
      return;
    }
    setPains((current) => [...current, { quote, vertical }]);
    selection.removeAllRanges();
    setError(null);
  }

  function save(expected: ExpectedPain[]) {
    startTransition(async () => {
      const result = await saveLabel(item.id, expected, notes);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <article ref={postRef} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-emerald-400"
        >
          {item.id} ↗
        </a>
        {item.title && <h2 className="mt-2 text-lg font-semibold text-zinc-100">{item.title}</h2>}
        {item.body !== item.title && (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-300 selection:bg-emerald-500/30">
            {item.body}
          </p>
        )}
      </article>

      <section className="rounded-xl border border-zinc-800 p-5">
        <h3 className="font-semibold">Dolores en este post</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Selecciona en el post el fragmento que muestra cada dolor, elige la vertical y agrégalo.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value as Vertical)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          >
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {VERTICAL_LABELS[v]}
              </option>
            ))}
          </select>
          <button
            type="button"
            // Keep the text selection when the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={addSelection}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium hover:bg-zinc-700"
          >
            + Agregar selección como dolor
          </button>
        </div>

        {pains.length > 0 && (
          <ul className="mt-4 space-y-2">
            {pains.map((pain, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-lg bg-zinc-900 p-3 text-sm"
              >
                <div>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">
                    {VERTICAL_LABELS[pain.vertical]}
                  </span>
                  <p className="mt-1.5 text-zinc-300 italic">“{pain.quote}”</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPains((current) => current.filter((_, j) => j !== i))}
                  className="text-zinc-500 hover:text-red-400"
                  aria-label="Quitar dolor"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional): dudas, por qué es o no un dolor…"
          rows={2}
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={pending || pains.length === 0}
            onClick={() => save(pains)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Guardar {pains.length} {pains.length === 1 ? "dolor" : "dolores"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => save([])}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
          >
            No tiene dolores
          </button>
        </div>
      </section>
    </div>
  );
}
