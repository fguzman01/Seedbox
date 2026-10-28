import { VERTICALS, type Vertical } from "./pains";

/** Dashboard filters (H5). They live in the URL next to the weights (`w`). */
export const SORTS = ["score", "evidence", "recent"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  score: "Mejor puntaje",
  evidence: "Más evidencia",
  recent: "Actividad reciente",
};

export const PAGE_SIZE = 24;

export interface Filters {
  verticals: Vertical[];
  minScore: number;
  assessedOnly: boolean;
  payingOnly: boolean;
  query: string;
  sort: Sort;
  limit: number;
}

export const DEFAULT_FILTERS: Filters = {
  verticals: [],
  minScore: 0,
  assessedOnly: false,
  payingOnly: false,
  query: "",
  sort: "score",
  limit: PAGE_SIZE,
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseFilters(params: Params): Filters {
  const verticals = (first(params.v) ?? "")
    .split(",")
    .filter((v): v is Vertical => (VERTICALS as string[]).includes(v));
  const minScore = Number(first(params.min));
  const limit = Number(first(params.n));
  const sort = first(params.sort);
  return {
    verticals: [...new Set(verticals)],
    minScore: Number.isFinite(minScore) ? Math.min(10, Math.max(0, minScore)) : 0,
    assessedOnly: first(params.assessed) === "1",
    payingOnly: first(params.paying) === "1",
    query: (first(params.q) ?? "").trim().slice(0, 100),
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as Sort) : "score",
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : PAGE_SIZE,
  };
}

/** Only non-default values are written, so the default dashboard has a clean URL. */
export function filtersToParams(filters: Filters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.verticals.length) params.v = filters.verticals.join(",");
  if (filters.minScore > 0) params.min = String(filters.minScore);
  if (filters.assessedOnly) params.assessed = "1";
  if (filters.payingOnly) params.paying = "1";
  if (filters.query) params.q = filters.query;
  if (filters.sort !== "score") params.sort = filters.sort;
  if (filters.limit !== PAGE_SIZE) params.n = String(filters.limit);
  return params;
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.verticals.length > 0 ||
    filters.minScore > 0 ||
    filters.assessedOnly ||
    filters.payingOnly ||
    filters.query !== ""
  );
}

/** The fields the dashboard needs to filter and sort an opportunity. */
export interface FilterableOpportunity {
  title: string;
  summary: string;
  mainVertical: Vertical;
  verticals: Vertical[];
  authorCount: number;
  signalCount: number;
  willingnessImplied: number;
  willingnessExplicit: number;
  assessedAt: Date | null;
  updatedAt: Date;
  score: { total: number };
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function matches(o: FilterableOpportunity, filters: Filters, ignoreVerticals = false): boolean {
  if (!ignoreVerticals && filters.verticals.length) {
    if (!o.verticals.some((v) => filters.verticals.includes(v))) return false;
  }
  if (o.score.total < filters.minScore) return false;
  if (filters.assessedOnly && !o.assessedAt) return false;
  if (filters.payingOnly && o.willingnessImplied + o.willingnessExplicit === 0) return false;
  if (filters.query) {
    // Accent-insensitive, every word must appear ("facturacion agencias").
    const haystack = normalize(`${o.title} ${o.summary}`);
    if (!normalize(filters.query).split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

const comparators: Record<Sort, (a: FilterableOpportunity, b: FilterableOpportunity) => number> = {
  score: (a, b) => b.score.total - a.score.total || b.signalCount - a.signalCount,
  evidence: (a, b) => b.authorCount - a.authorCount || b.signalCount - a.signalCount || b.score.total - a.score.total,
  recent: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
};

export interface FilteredResult<T> {
  items: T[];
  /** Matches before pagination. */
  total: number;
  /** Opportunities per vertical, counting every other active filter but not the vertical one. */
  verticalCounts: Partial<Record<Vertical, number>>;
}

export function applyFilters<T extends FilterableOpportunity>(all: T[], filters: Filters): FilteredResult<T> {
  const verticalCounts: Partial<Record<Vertical, number>> = {};
  for (const o of all) {
    if (!matches(o, filters, true)) continue;
    for (const v of o.verticals) verticalCounts[v] = (verticalCounts[v] ?? 0) + 1;
  }
  const matching = all.filter((o) => matches(o, filters)).sort(comparators[filters.sort]);
  return { items: matching.slice(0, filters.limit), total: matching.length, verticalCounts };
}

/** Rebuilds `?a=1&b=2` from Next.js search params, to carry the dashboard state across pages. */
export function toQueryString(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (v) search.set(key, v);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
