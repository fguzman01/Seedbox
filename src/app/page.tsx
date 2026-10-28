import { connection } from "next/server";
import { Suspense } from "react";
import { applyFilters, hasActiveFilters, parseFilters, toQueryString } from "@/lib/filters";
import { getOpportunities, getSignalStats } from "@/lib/queries";
import { parseWeights } from "@/lib/scoring";
import { DashboardFilters, ShowMore } from "./components/dashboard-filters";
import { EmptyState, Stat } from "./components/ui";
import { Nav } from "./components/nav";
import { OpportunityCard } from "./components/opportunity-card";
import { WeightsControl } from "./components/weights-control";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
      <Suspense fallback={<Nav current="opportunities" />}>
        <DashboardNav searchParams={searchParams} />
      </Suspense>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Radar de oportunidades de software
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Dolores reales del mercado, agrupados y puntuados, con evidencia trazable.
        </p>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Cargando oportunidades…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function DashboardNav({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { fav } = await searchParams;
  return <Nav current={fav === "1" ? "favorites" : "opportunities"} />;
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();

  if (!process.env.DATABASE_URL) {
    return (
      <EmptyState>
        Configura <code className="text-zinc-200">DATABASE_URL</code> en{" "}
        <code className="text-zinc-200">.env</code> para empezar.
      </EmptyState>
    );
  }

  const params = await searchParams;
  const weights = parseWeights(params.w);
  const filters = parseFilters(params);
  const [stats, all] = await Promise.all([getSignalStats(), getOpportunities(weights)]);
  const { items, total, verticalCounts } = applyFilters(all, filters);
  // Detail pages get the whole dashboard state, so "back" returns to the same view.
  const query = toQueryString(params);

  return (
    <>
      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Señales recolectadas" value={stats.total} />
        <Stat label="Por analizar" value={stats.pending} />
        <Stat label="Dolores detectados" value={stats.pains} />
        <Stat label="Oportunidades" value={stats.opportunities} />
      </section>

      {all.length === 0 ? (
        <EmptyState>
          Aún no hay oportunidades. El flujo es{" "}
          <code className="text-zinc-200">ingest → extract → cluster → assess</code>.
        </EmptyState>
      ) : (
        <>
          <DashboardFilters filters={filters} verticalCounts={verticalCounts} />
          <WeightsControl weights={weights} />

          <p className="mb-3 text-sm text-zinc-500">
            {total === all.length
              ? `${total} ${total === 1 ? "oportunidad" : "oportunidades"}`
              : `${total} de ${all.length} oportunidades`}
          </p>

          {items.length === 0 ? (
            <EmptyState>
              Ninguna oportunidad cumple estos filtros.
              {hasActiveFilters(filters) && " Prueba quitando alguno con “Limpiar filtros”."}
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((o) => (
                <li key={o.id}>
                  <OpportunityCard opportunity={o} query={query} />
                </li>
              ))}
            </ul>
          )}
          {items.length < total && <ShowMore filters={filters} />}
        </>
      )}
    </>
  );
}
