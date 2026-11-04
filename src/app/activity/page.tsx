import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { getAnalystStatus } from "@/lib/analyst-status";
import { getDb } from "@/lib/db/client";
import type { Signal } from "@/lib/db/schema";
import { VERTICAL_LABELS } from "@/lib/pains";
import { getRecentPains, getRecentSignals } from "@/lib/queries";
import {
  ACTIVITY_LIST_ID,
  ACTIVITY_LIST_LIMIT,
  describeActivityFilter,
  getFilteredPains,
  getFilteredSignals,
  getSourceMix,
  parseActivityFilter,
  type ActivityFilter,
} from "@/lib/source-mix";
import { SOURCE_IDS } from "@/lib/sources";
import { sourceLabel } from "@/lib/sources/types";
import { AnalystStatusSection } from "../components/analyst-status";
import { SourceMixSection } from "../components/source-mix";
import { EmptyState } from "../components/ui";
import { Nav } from "../components/nav";
import { PainCard } from "../components/pain-card";

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

export default function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
      <Nav current="activity" />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Actividad reciente</h1>
        <p className="mt-2 text-zinc-400">
          Cómo va el analista diario, de qué fuentes viene el radar y lo último que entró: dolores extraídos y posts
          recolectados.
        </p>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Activity({ searchParams }: Pick<PageProps<"/activity">, "searchParams">) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return <EmptyState>Configura DATABASE_URL en .env para empezar.</EmptyState>;
  }
  const now = new Date();
  const filter = parseActivityFilter(await searchParams);
  const db = getDb();
  const [analyst, mix] = await Promise.all([getAnalystStatus(db, now), getSourceMix(db, SOURCE_IDS, now)]);

  return (
    <>
      <AnalystStatusSection status={analyst} now={now} />
      <SourceMixSection mix={mix} now={now} />
      {filter ? <FilteredList filter={filter} now={now} /> : <RecentLists />}
    </>
  );
}

/** The posts or pains behind a number of the source mix (H14). */
async function FilteredList({ filter, now }: { filter: ActivityFilter; now: Date }) {
  const db = getDb();
  let count: number;
  let content: React.ReactNode;
  if (filter.list === "posts") {
    const rows = await getFilteredSignals(db, filter, now);
    count = rows.length;
    content = <SignalList signals={rows} />;
  } else {
    const rows = await getFilteredPains(db, filter, now);
    count = rows.length;
    content = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <li key={p.id}>
            <PainCard pain={p} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section id={ACTIVITY_LIST_ID} aria-labelledby="filtered-list" className="scroll-mt-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="filtered-list" className="text-lg font-semibold">
          {describeActivityFilter(filter, (v) => VERTICAL_LABELS[v])}
        </h2>
        <Link href="/activity" className="text-sm text-zinc-500 hover:text-zinc-300">
          Quitar filtro
        </Link>
      </div>
      {count >= ACTIVITY_LIST_LIMIT && (
        <p className="mb-3 text-sm text-zinc-500">Se muestran los {ACTIVITY_LIST_LIMIT} más recientes.</p>
      )}
      {count === 0 ? (
        <EmptyState>No hay {filter.list === "posts" ? "posts" : "dolores"} con este filtro.</EmptyState>
      ) : (
        content
      )}
    </section>
  );
}

async function RecentLists() {
  const [recentPains, recent] = await Promise.all([getRecentPains(), getRecentSignals()]);
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Últimos dolores detectados</h2>
      {recentPains.length === 0 ? (
        <div className="mb-10">
          <EmptyState>
            Aún no hay dolores. Ejecuta <code className="text-zinc-200">npm run extract</code>.
          </EmptyState>
        </div>
      ) : (
        <ul className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <SignalList signals={recent} />
      )}
    </>
  );
}

function SignalList({ signals }: { signals: Signal[] }) {
  return (
    <ul className="space-y-3">
      {signals.map((s) => (
        <li key={s.id}>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-500/50 hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{sourceLabel(s.source, s.metadata)}</span>
              <span>{dateFormat.format(s.publishedAt)}</span>
              {s.author && <span>· {s.author}</span>}
              <span>· {s.status === "processed" ? "con dolores" : s.status === "discarded" ? "sin dolores" : "por analizar"}</span>
            </div>
            <p className="mt-2 font-medium text-zinc-100">{s.title ?? s.body.slice(0, 120)}</p>
            {s.title && s.body !== s.title && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{s.body}</p>}
          </a>
        </li>
      ))}
    </ul>
  );
}
