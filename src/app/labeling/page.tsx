import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { loadDataset } from "@/lib/eval/dataset";
import { labelingProgress } from "@/lib/eval/labeling";
import { LabelForm } from "./label-form";

export default function LabelingPage({ searchParams }: PageProps<"/labeling">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8">
      <header className="mb-8">
        <Link href="/" className="text-sm font-medium tracking-widest text-emerald-400 uppercase">
          Seedbox
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Etiquetado</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Marca a mano los dolores de posts reales. Con esto medimos qué tan bien los encuentra la
          IA (<code className="text-zinc-300">npm run eval</code>).
        </p>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Labeling searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Labeling({ searchParams }: Pick<PageProps<"/labeling">, "searchParams">) {
  await connection();
  if (process.env.NODE_ENV === "production") notFound();

  const { id } = await searchParams;
  const items = await loadDataset();
  const progress = labelingProgress(items);
  const current =
    items.find((item) => item.id === id) ?? items.find((item) => item.expected === null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-zinc-400">
        El dataset está vacío. Ejecuta <code className="text-zinc-200">npm run eval:sample</code>{" "}
        para traer posts de la base de datos.
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <div>
        {current ? (
          <LabelForm key={current.id} item={current} />
        ) : (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-8 text-center">
            <p className="font-semibold text-emerald-300">Todo etiquetado 🎉</p>
            <p className="mt-2 text-sm text-zinc-400">
              Corre <code className="text-zinc-200">npm run eval</code> o trae más posts con{" "}
              <code className="text-zinc-200">npm run eval:sample</code>.
            </p>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-zinc-800 p-4">
          <p className="text-sm text-zinc-400">
            <span className="text-2xl font-semibold text-zinc-100">{progress.labeled}</span> /{" "}
            {progress.goal} etiquetados
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.min(100, (progress.labeled / progress.goal) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {progress.withPains} con dolores · {progress.total - progress.labeled} por etiquetar
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/labeling?id=${encodeURIComponent(item.id)}`}
                title={item.title ?? item.id}
                className={`block h-6 w-6 rounded ${
                  item.id === current?.id
                    ? "ring-2 ring-emerald-400"
                    : ""
                } ${
                  item.expected === null
                    ? "bg-zinc-800"
                    : item.expected.length > 0
                      ? "bg-emerald-600"
                      : "bg-zinc-600"
                }`}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-600">
          Verde: con dolores · Gris claro: sin dolores · Oscuro: pendiente
        </p>
      </aside>
    </div>
  );
}
