"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  AXES,
  AXIS_LABELS,
  DEFAULT_WEIGHTS,
  isDefaultWeights,
  serializeWeights,
  type Axis,
  type Weights,
} from "@/lib/scoring";

/** Sliders for the scoring weights; the weights live in the URL (`?w=`), see ADR-0005. */
export function WeightsControl({ weights }: { weights: Weights }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(weights);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function apply(next: Weights) {
    setDraft(next);
    clearTimeout(timer.current);
    // Wait until the slider stops moving before re-rendering the server list.
    timer.current = setTimeout(() => {
      // Keep the other params (dashboard filters) untouched.
      const params = new URLSearchParams(searchParams.toString());
      if (isDefaultWeights(next)) params.delete("w");
      else params.set("w", serializeWeights(next));
      const query = params.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    }, 250);
  }

  const total = AXES.reduce((sum, axis) => sum + draft[axis], 0);

  return (
    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
        aria-expanded={open}
      >
        <span className="text-zinc-300">
          Pesos del puntaje
          {!isDefaultWeights(draft) && <span className="ml-2 text-emerald-400">personalizados</span>}
          {pending && <span className="ml-2 text-zinc-500">actualizando…</span>}
        </span>
        <span className="text-zinc-500">{open ? "Ocultar" : "Ajustar"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-800 px-4 py-4">
          {AXES.map((axis: Axis) => (
            <label key={axis} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[12rem_1fr_3rem]">
              <span className="text-zinc-300">{AXIS_LABELS[axis]}</span>
              <span className="text-right text-zinc-400 sm:order-last">
                {total ? Math.round((draft[axis] / total) * 100) : 0}%
              </span>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={draft[axis]}
                onChange={(e) => apply({ ...draft, [axis]: Number(e.target.value) })}
                className="col-span-2 accent-emerald-500 sm:col-span-1"
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => apply(DEFAULT_WEIGHTS)}
            disabled={isDefaultWeights(draft)}
            className="text-xs text-zinc-400 hover:text-emerald-400 disabled:opacity-40"
          >
            Restablecer pesos de la visión
          </button>
        </div>
      )}
    </div>
  );
}
