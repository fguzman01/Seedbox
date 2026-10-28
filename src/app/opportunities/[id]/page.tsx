import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VERTICAL_LABELS } from "@/lib/pains";
import { getOpportunity } from "@/lib/queries";
import { Badge, PainCard } from "../../components/pain-card";

export default function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8">
      <Link href="/" className="text-sm text-zinc-500 hover:text-emerald-400">
        ← Volver al radar
      </Link>
      <Suspense fallback={<p className="mt-8 text-zinc-500">Cargando…</p>}>
        <Opportunity params={params} />
      </Suspense>
    </main>
  );
}

async function Opportunity({ params }: Pick<PageProps<"/opportunities/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const opportunity = /^\d+$/.test(id) ? await getOpportunity(Number(id)) : null;
  if (!opportunity) notFound();

  const verticals = [...new Set(opportunity.pains.map((p) => p.vertical))];
  const payingPains = opportunity.pains.filter((p) => p.willingnessToPay !== "none").length;

  return (
    <>
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
