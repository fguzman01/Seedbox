import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { VERTICAL_LABELS } from "@/lib/pains";
import { getOpportunities, getRecentPains, getRecentSignals, getSignalStats } from "@/lib/queries";
import { isDefaultWeights, parseWeights, serializeWeights } from "@/lib/scoring";
import { Badge, PainCard } from "./components/pain-card";
import { AxisBars, TotalBadge } from "./components/score";
import { WeightsControl } from "./components/weights-control";

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-widest text-emerald-400 uppercase">Seedbox</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Radar de oportunidades de software
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Dolores reales del mercado, agrupados y puntuados, con evidencia trazable.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <Link href="/labeling" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
            Etiquetar posts para evaluar la IA →
          </Link>
        )}
      </header>
      <Suspense fallback={<p className="text-zinc-500">Cargando señales…</p>}>
        <Signals searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Signals({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const weights = parseWeights((await searchParams).w);
  const weightsQuery = isDefaultWeights(weights) ? "" : `?w=${serializeWeights(weights)}`;

  if (!process.env.DATABASE_URL) {
    return (
      <EmptyState>
        Configura <code className="text-zinc-200">DATABASE_URL</code> en{" "}
        <code className="text-zinc-200">.env</code> para empezar.
      </EmptyState>
    );
  }

  const [stats, topOpportunities, recentPains, recent] = await Promise.all([
    getSignalStats(),
    getOpportunities(weights),
    getRecentPains(),
    getRecentSignals(),
  ]);

  return (
    <>
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Señales recolectadas" value={stats.total} />
        <Stat label="Por analizar" value={stats.pending} />
        <Stat label="Dolores detectados" value={stats.pains} />
        <Stat label="Oportunidades" value={stats.opportunities} />
      </section>

      <h2 className="mb-4 text-lg font-semibold">Oportunidades</h2>
      <WeightsControl weights={weights} />
      {topOpportunities.length === 0 ? (
        <div className="mb-10">
          <EmptyState>
            Aún no hay oportunidades. Ejecuta <code className="text-zinc-200">npm run cluster</code>.
          </EmptyState>
        </div>
      ) : (
        <ul className="mb-10 grid gap-3 sm:grid-cols-2">
          {topOpportunities.map((o) => (
            <li key={o.id}>
              <Link
                href={`/opportunities/${o.id}${weightsQuery}`}
                className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-500/50 hover:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <Badge tone="emerald">{VERTICAL_LABELS[o.mainVertical]}</Badge>
                  <TotalBadge score={o.score} />
                </div>
                <p className="mt-2 font-semibold text-zinc-100">{o.title}</p>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-400">{o.summary}</p>
                <div className="mt-auto pt-4">
                  <AxisBars axes={o.axes} />
                </div>
                <p className="pt-3 text-xs text-zinc-500">
                  {o.signalCount} {o.signalCount === 1 ? "post" : "posts"} · {o.authorCount}{" "}
                  {o.authorCount === 1 ? "autor" : "autores"} · {o.painCount}{" "}
                  {o.painCount === 1 ? "dolor" : "dolores"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-4 text-lg font-semibold">Últimos dolores detectados</h2>
      {recentPains.length === 0 ? (
        <div className="mb-10">
          <EmptyState>
            Aún no hay dolores. Ejecuta <code className="text-zinc-200">npm run extract</code>.
          </EmptyState>
        </div>
      ) : (
        <ul className="mb-10 grid gap-3 sm:grid-cols-2">
          {recentPains.map((p) => (
            <li key={p.id}>
              <PainCard pain={p} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-4 text-lg font-semibold">Últimas señales</h2>
      {recent.length === 0 ? (
        <EmptyState>
          Aún no hay señales. Ejecuta <code className="text-zinc-200">npm run ingest</code>.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {recent.map((s) => (
            <li key={s.id}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-500/50 hover:bg-zinc-900"
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{s.source}</span>
                  <span>{dateFormat.format(s.publishedAt)}</span>
                  {s.author && <span>· {s.author}</span>}
                </div>
                <p className="mt-2 font-medium text-zinc-100">{s.title ?? s.body.slice(0, 120)}</p>
                {s.title && s.body !== s.title && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{s.body}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-zinc-400">
      {children}
    </div>
  );
}
