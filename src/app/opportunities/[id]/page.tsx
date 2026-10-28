import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VERTICAL_LABELS } from "@/lib/pains";
import { getOpportunity } from "@/lib/queries";
import { isDefaultWeights, parseWeights, serializeWeights } from "@/lib/scoring";
import { Badge, PainCard } from "../../components/pain-card";
import { AxisBars, TotalBadge } from "../../components/score";

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

export default function OpportunityPage({ params, searchParams }: PageProps<"/opportunities/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8">
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Opportunity params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Opportunity({ params, searchParams }: PageProps<"/opportunities/[id]">) {
  await connection();
  const { id } = await params;
  const weights = parseWeights((await searchParams).w);
  const opportunity = /^\d+$/.test(id) ? await getOpportunity(Number(id), weights) : null;
  if (!opportunity) notFound();
  const backHref = isDefaultWeights(weights) ? "/" : `/?w=${serializeWeights(weights)}`;

  const verticals = [...new Set(opportunity.pains.map((p) => p.vertical))];
  const payingPains = opportunity.pains.filter((p) => p.willingnessToPay !== "none").length;

  return (
    <>
      <Link href={backHref} className="text-sm text-zinc-500 hover:text-emerald-400">
        ← Volver al radar
      </Link>
      <header className="mt-6 mb-8">
        <div className="flex flex-wrap gap-1.5">
          {verticals.map((v) => (
            <Badge key={v} tone="emerald">
              {VERTICAL_LABELS[v]}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{opportunity.title}</h1>
        <p className="mt-3 max-w-3xl text-zinc-400">{opportunity.summary}</p>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Posts" value={opportunity.signalCount} />
        <Stat label="Autores distintos" value={opportunity.authorCount} />
        <Stat label="Dolores" value={opportunity.painCount} />
        <Stat label="Con señales de pago" value={payingPains} />
      </section>

      <h2 className="mb-4 text-lg font-semibold">Puntaje</h2>
      <section className="mb-10 grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-xs text-zinc-500">Total ponderado</p>
          <div className="mt-1">
            <TotalBadge score={opportunity.score} size="lg" />
          </div>
          <div className="mt-5">
            <AxisBars axes={opportunity.axes} labeled />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          {opportunity.assessedAt ? (
            <div className="space-y-5 text-sm">
              <div>
                <h3 className="font-semibold text-zinc-200">Competencia</h3>
                <p className="mt-1 text-zinc-400">{opportunity.competitionRationale}</p>
                {opportunity.competitors && opportunity.competitors.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {opportunity.competitors.map((c) => (
                      <li key={c.url} className="rounded-lg bg-zinc-900 p-3">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-emerald-400 hover:underline"
                        >
                          {c.name} ↗
                        </a>
                        <p className="mt-1 text-zinc-400">{c.note}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200">Ajuste al constructor</h3>
                <p className="mt-1 text-zinc-400">{opportunity.buildabilityRationale}</p>
              </div>
              <p className="text-xs text-zinc-600">
                Evaluado el {dateFormat.format(opportunity.assessedAt)} con {opportunity.assessmentModel}.
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Competencia y ajuste al constructor aún no están evaluados. Ejecuta{" "}
              <code className="text-zinc-200">npm run assess</code> para que la IA busque
              competidores y estime el esfuerzo.
            </p>
          )}
        </div>
      </section>

      <h2 className="mb-4 text-lg font-semibold">Evidencia</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {opportunity.pains.map((p) => (
          <li key={p.id}>
            <PainCard pain={p} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
