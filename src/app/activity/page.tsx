import { connection } from "next/server";
import { Suspense } from "react";
import { getRecentPains, getRecentSignals } from "@/lib/queries";
import { sourceLabel } from "@/lib/sources/types";
import { EmptyState } from "../components/ui";
import { Nav } from "../components/nav";
import { PainCard } from "../components/pain-card";

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

export default function ActivityPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
      <Nav current="activity" />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Actividad reciente</h1>
        <p className="mt-2 text-zinc-400">Lo último que entró al radar: dolores extraídos y posts recolectados.</p>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Activity />
      </Suspense>
    </main>
  );
}

async function Activity() {
  await connection();
  if (!process.env.DATABASE_URL) {
    return <EmptyState>Configura DATABASE_URL en .env para empezar.</EmptyState>;
  }
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
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                    {sourceLabel(s.source, s.metadata)}
                  </span>
                  <span>{dateFormat.format(s.publishedAt)}</span>
                  {s.author && <span>· {s.author}</span>}
                  <span>· {s.status === "processed" ? "con dolores" : s.status === "discarded" ? "sin dolores" : "por analizar"}</span>
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
