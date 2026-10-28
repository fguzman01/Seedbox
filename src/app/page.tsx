import { connection } from "next/server";
import { Suspense } from "react";
import { getRecentSignals, getSignalStats } from "@/lib/queries";

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

export default function Home() {
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
      </header>
      <Suspense fallback={<p className="text-zinc-500">Cargando señales…</p>}>
        <Signals />
      </Suspense>
    </main>
  );
}

async function Signals() {
  await connection();

  if (!process.env.DATABASE_URL) {
    return (
      <EmptyState>
        Configura <code className="text-zinc-200">DATABASE_URL</code> en{" "}
        <code className="text-zinc-200">.env</code> para empezar.
      </EmptyState>
    );
  }

  const [stats, recent] = await Promise.all([getSignalStats(), getRecentSignals()]);

  return (
    <>
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Señales recolectadas" value={stats.total} />
        <Stat label="Por analizar" value={stats.pending} />
        <Stat label="Oportunidades" value="—" hint="Llega con H3" />
      </section>

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
