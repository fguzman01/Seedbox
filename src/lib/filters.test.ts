import { describe, expect, it } from "vitest";
import {
  applyFilters,
  DEFAULT_FILTERS,
  filtersToParams,
  hasActiveFilters,
  PAGE_SIZE,
  parseFilters,
  toQueryString,
  type FilterableOpportunity,
  type Filters,
} from "./filters";

function opportunity(overrides: Partial<FilterableOpportunity> & { title: string }): FilterableOpportunity {
  return {
    summary: "",
    mainVertical: "smb",
    verticals: ["smb"],
    authorCount: 1,
    signalCount: 1,
    willingnessImplied: 0,
    willingnessExplicit: 0,
    assessedAt: null,
    updatedAt: new Date("2026-10-01"),
    score: { total: 5 },
    ...overrides,
  };
}

const all = [
  opportunity({
    title: "Facturación para agencias",
    summary: "Las herramientas son caras",
    verticals: ["freelance", "finance"],
    mainVertical: "freelance",
    score: { total: 8 },
    authorCount: 2,
    willingnessExplicit: 1,
    assessedAt: new Date(),
  }),
  opportunity({ title: "Agenda de turnos", verticals: ["health"], mainVertical: "health", score: { total: 6 }, authorCount: 5 }),
  opportunity({ title: "Inventario para tiendas", score: { total: 4 }, updatedAt: new Date("2026-10-20"), willingnessImplied: 2 }),
];

const titles = (items: FilterableOpportunity[]) => items.map((o) => o.title);
const filters = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch });

describe("applyFilters", () => {
  it("sorts by score by default and counts verticals", () => {
    const result = applyFilters(all, DEFAULT_FILTERS);
    expect(titles(result.items)).toEqual(["Facturación para agencias", "Agenda de turnos", "Inventario para tiendas"]);
    expect(result.total).toBe(3);
    expect(result.verticalCounts).toEqual({ freelance: 1, finance: 1, health: 1, smb: 1 });
  });

  it("filters by any of the selected verticals, including secondary ones", () => {
    expect(titles(applyFilters(all, filters({ verticals: ["finance"] })).items)).toEqual(["Facturación para agencias"]);
    expect(applyFilters(all, filters({ verticals: ["finance", "health"] })).total).toBe(2);
  });

  it("keeps vertical counts independent of the vertical filter but not of the others", () => {
    const { verticalCounts } = applyFilters(all, filters({ verticals: ["health"], minScore: 5 }));
    expect(verticalCounts).toEqual({ freelance: 1, finance: 1, health: 1 });
  });

  it("filters by minimum score, assessment and willingness to pay", () => {
    expect(titles(applyFilters(all, filters({ minScore: 6 })).items)).toEqual(["Facturación para agencias", "Agenda de turnos"]);
    expect(titles(applyFilters(all, filters({ assessedOnly: true })).items)).toEqual(["Facturación para agencias"]);
    expect(titles(applyFilters(all, filters({ payingOnly: true })).items)).toEqual([
      "Facturación para agencias",
      "Inventario para tiendas",
    ]);
  });

  it("searches title and summary, ignoring case and accents, requiring every word", () => {
    expect(titles(applyFilters(all, filters({ query: "FACTURACION caras" })).items)).toEqual(["Facturación para agencias"]);
    expect(applyFilters(all, filters({ query: "facturacion tiendas" })).total).toBe(0);
  });

  it("sorts by evidence or by recent activity", () => {
    expect(titles(applyFilters(all, filters({ sort: "evidence" })).items)[0]).toBe("Agenda de turnos");
    expect(titles(applyFilters(all, filters({ sort: "recent" })).items)[0]).toBe("Inventario para tiendas");
  });

  it("paginates but reports the full total", () => {
    const result = applyFilters(all, filters({ limit: 2 }));
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
  });
});

describe("filters in the URL", () => {
  it("round-trips and writes only non-default values", () => {
    const custom = filters({
      verticals: ["health", "smb"],
      minScore: 6,
      assessedOnly: true,
      payingOnly: true,
      query: "turnos",
      sort: "evidence",
      limit: 48,
    });
    const params = filtersToParams(custom);
    expect(params).toEqual({ v: "health,smb", min: "6", assessed: "1", paying: "1", q: "turnos", sort: "evidence", n: "48" });
    expect(parseFilters(params)).toEqual(custom);
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({});
  });

  it("ignores invalid values", () => {
    expect(parseFilters({ v: "health,nope,health", min: "abc", sort: "random", n: "-3", assessed: "yes" })).toEqual(
      filters({ verticals: ["health"] }),
    );
    expect(parseFilters({ min: "42", n: "9999" })).toMatchObject({ minScore: 10, limit: 500 });
    expect(parseFilters({}).limit).toBe(PAGE_SIZE);
  });

  it("detects active filters (sort and page size do not count)", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ sort: "recent", limit: 48 }))).toBe(false);
    expect(hasActiveFilters(filters({ query: "x" }))).toBe(true);
  });

  it("rebuilds the query string from search params", () => {
    expect(toQueryString({ w: "25,20,25,15,15", v: ["health", "x"], q: undefined, empty: "" })).toBe(
      "?w=25%2C20%2C25%2C15%2C15&v=health",
    );
    expect(toQueryString({})).toBe("");
  });
});
