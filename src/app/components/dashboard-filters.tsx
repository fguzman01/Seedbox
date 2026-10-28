"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  DEFAULT_FILTERS,
  filtersToParams,
  hasActiveFilters,
  SORT_LABELS,
  SORTS,
  type Filters,
  type Sort,
} from "@/lib/filters";
import { VERTICAL_LABELS, VERTICALS, type Vertical } from "@/lib/pains";

const MIN_SCORES = [0, 5, 6, 7, 8];
const FILTER_KEYS = ["v", "min", "assessed", "paying", "fav", "q", "sort", "n"];

/**
 * Writes the filters into the URL, keeping other params such as the weights (`w`).
 * The returned filters update immediately, so controls react before the server answers.
 */
function useFilterNavigation(filters: Filters) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(filters);

  function navigate(next: Filters) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    for (const [key, value] of Object.entries(filtersToParams(next))) params.set(key, value);
    const query = params.toString();
    startTransition(() => {
      setOptimistic(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return { filters: optimistic, navigate, pending };
}

export function DashboardFilters({
  filters: current,
  verticalCounts,
}: {
  filters: Filters;
  verticalCounts: Partial<Record<Vertical, number>>;
}) {
  const { filters, navigate, pending } = useFilterNavigation(current);
  const [query, setQuery] = useState(current.query);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Changing a filter goes back to the first page.
  const update = (patch: Partial<Filters>) => navigate({ ...filters, ...patch, limit: DEFAULT_FILTERS.limit });

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ query: value.trim() }), 300);
  }

  function toggleVertical(v: Vertical) {
    const verticals = filters.verticals.includes(v)
      ? filters.verticals.filter((x) => x !== v)
      : [...filters.verticals, v];
    update({ verticals });
  }

  // Show verticals that have opportunities, plus any selected one (so it can be unselected).
  const shownVerticals = VERTICALS.filter((v) => verticalCounts[v] || filters.verticals.includes(v));

  return (
    <div className={`mb-4 space-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar oportunidades…"
          aria-label="Buscar oportunidades"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
        />
        <div className="flex gap-2">
          <select
            value={filters.minScore}
            onChange={(e) => update({ minScore: Number(e.target.value) })}
            aria-label="Puntaje mínimo"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm sm:flex-none"
          >
            {MIN_SCORES.map((min) => (
              <option key={min} value={min}>
                {min === 0 ? "Cualquier puntaje" : `Puntaje ≥ ${min}`}
              </option>
            ))}
          </select>
          <select
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as Sort })}
            aria-label="Ordenar por"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm sm:flex-none"
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {shownVerticals.map((v) => {
          const active = filters.verticals.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggleVertical(v)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                active
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {VERTICAL_LABELS[v]} <span className="text-zinc-500">{verticalCounts[v] ?? 0}</span>
            </button>
          );
        })}
        <span className="mx-1 hidden h-4 w-px bg-zinc-800 sm:inline-block" />
        <Toggle label="★ Sólo favoritas" checked={filters.starredOnly} onChange={(starredOnly) => update({ starredOnly })} />
        <Toggle label="Sólo evaluadas" checked={filters.assessedOnly} onChange={(assessedOnly) => update({ assessedOnly })} />
        <Toggle label="Con señales de pago" checked={filters.payingOnly} onChange={(payingOnly) => update({ payingOnly })} />
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              update({ ...DEFAULT_FILTERS, sort: filters.sort });
            }}
            className="ml-1 text-xs text-zinc-400 hover:text-emerald-400"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-emerald-500"
      />
      {label}
    </label>
  );
}

/** "Ver más": shows the next page by raising the limit in the URL. */
export function ShowMore({ filters: current }: { filters: Filters }) {
  const { filters, navigate, pending } = useFilterNavigation(current);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => navigate({ ...filters, limit: filters.limit + DEFAULT_FILTERS.limit })}
      className="mx-auto mt-6 block rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? "Cargando…" : "Ver más"}
    </button>
  );
}
