"use client";

import { useRef, useState, useTransition } from "react";
import type { EvalItem, ExpectedPain } from "@/lib/eval/dataset";
import {
  PAIN_TYPE_LABELS,
  PAIN_TYPES,
  painType,
  VERTICAL_LABELS,
  VERTICALS,
  type PainType,
  type Vertical,
} from "@/lib/pains";
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
    setPains((current) => [...current, { quote, vertical, type: "concrete" }]);
    selection.removeAllRanges();
    setError(null);
  }

  function setType(index: number, type: PainType) {
    setPains((current) => current.map((pain, i) => (i === index ? { ...pain, type } : pain)));
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
          Después indica si es concreto o latente.
        </p>
        <PainCriterion />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">
                      {VERTICAL_LABELS[pain.vertical]}
                    </span>
                    <select
                      value={painType(pain)}
                      onChange={(e) => setType(i, e.target.value as PainType)}
                      aria-label="Tipo de dolor"
                      className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs"
                    >
                      {PAIN_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PAIN_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
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

/** Short version of the criterion in evals/extraction/README.md, visible while labeling (H17). */
function PainCriterion() {
  return (
    <dl className="mt-3 space-y-1.5 rounded-lg bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-400">
      <div>
        <dt className="inline font-semibold text-zinc-200">Concreto: </dt>
        <dd className="inline">
          una tarea o situación que falla (lenta, cara, propensa a errores, frustrante o sin
          herramienta); el autor diría “si existiera X, se resolvería”.
        </dd>
      </div>
      <div>
        <dt className="inline font-semibold text-zinc-200">Latente: </dt>
        <dd className="inline">
          las tres cosas, con una cita que lo pruebe: (1) alguien afectado identificable; (2) un
          estado o necesidad sostenida sin tarea que falle (incertidumbre, desorientación, pérdida
          de motivación o práctica, ansiedad por un cambio); (3) lo que falta podría aportarlo el
          software (información, aprendizaje, orientación, acompañamiento, comunidad,
          planificación). La cita muestra el estado, no sólo el tema.
        </dd>
      </div>
      <div>
        <dt className="inline font-semibold text-zinc-200">Sin dolor: </dt>
        <dd className="inline">
          opiniones sobre el mercado o empresas, llamados a la acción, avisos de incidentes de
          terceros, preguntas generales sin interés personal, hilos recurrentes y miedos que el
          software no puede abordar.
        </dd>
      </div>
    </dl>
  );
}
