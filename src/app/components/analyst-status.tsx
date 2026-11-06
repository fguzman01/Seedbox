import Link from "next/link";
import { formatAge, STALE_AFTER_HOURS, type AnalystStatus } from "@/lib/analyst-status";
import type { WorkKind } from "@/lib/agent";
import { activityHref } from "@/lib/source-mix";

const KIND_LABELS: Record<WorkKind, { label: string; unit: string }> = {
  extract: { label: "Extraer dolores", unit: "posts pendientes" },
  cluster: { label: "Agrupar", unit: "dolores sin agrupar" },
  assess: { label: "Evaluar", unit: "oportunidades por evaluar" },
};

const dateTimeFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

/** Shown when the analyst delivered before but nothing arrived in the last 36 hours. */
export function AnalystStoppedBanner({ lastDeliveryAt, now, link = false }: { lastDeliveryAt: Date; now: Date; link?: boolean }) {
  return (
    <div role="alert" className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
      <p className="font-medium">El análisis está detenido.</p>
      <p className="mt-1 text-amber-200/80">
        No llegan entregas del analista desde hace más de {STALE_AFTER_HOURS} horas: la última fue el{" "}
        {dateTimeFormat.format(lastDeliveryAt)} ({formatAge(lastDeliveryAt, now)}). Revisa la tarea programada de Claude
        Code.
        {link && (
          <>
            {" "}
            <Link href="/activity" className="underline hover:text-amber-100">
              Ver estado del analista
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export function AnalystStatusSection({ status, now }: { status: AnalystStatus; now: Date }) {
  const { balance } = status;
  return (
    <section className="mb-10" aria-labelledby="analyst-status">
      <h2 id="analyst-status" className="mb-4 text-lg font-semibold">
        Estado del analista
      </h2>

      {status.state === "stopped" && status.lastDeliveryAt && (
        <AnalystStoppedBanner lastDeliveryAt={status.lastDeliveryAt} now={now} />
      )}
      {status.state === "never" && (
        <p className="mb-4 rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-400">
          El analista aún no ha entregado resultados. Ver el paso 5 de{" "}
          <code className="text-zinc-200">docs/deploy.md</code>.
        </p>
      )}

      <ul className="mb-4 grid gap-4 sm:grid-cols-3">
        {status.kinds.map((k) => (
          <li key={k.kind} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">{KIND_LABELS[k.kind].label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">
              {k.pending}
              {k.capped && "+"}
            </p>
            <p className="text-xs text-zinc-500">{KIND_LABELS[k.kind].unit}</p>
            <p className="mt-2 text-xs text-zinc-600">
              {k.lastDeliveryAt
                ? `Última entrega: ${dateTimeFormat.format(k.lastDeliveryAt)} (${formatAge(k.lastDeliveryAt, now)})`
                : "Sin entregas registradas"}
            </p>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
        <p className="text-xs text-zinc-500">Balance de los últimos {balance.days} días</p>
        <p className="mt-1 text-zinc-200">
          <span className="font-semibold">{balance.ingested}</span> posts ingresados ·{" "}
          <span className="font-semibold">{balance.processed}</span> procesados
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          de ellos, descartados por prefiltro:{" "}
          <Link
            href={activityHref({ list: "posts", stage: "prefiltered", days: balance.days })}
            className="font-semibold text-zinc-300 hover:text-emerald-300 hover:underline"
          >
            {balance.prefiltered}
          </Link>
        </p>
        <p
          className={`mt-1 ${
            balance.trend === "growing" ? "text-amber-300" : balance.trend === "shrinking" ? "text-emerald-400" : "text-zinc-400"
          }`}
        >
          {balance.trend === "growing"
            ? `A este ritmo la cola crece: ${balance.net} posts más por analizar que hace ${balance.days} días.`
            : balance.trend === "shrinking"
              ? `A este ritmo la cola baja: ${-balance.net} posts menos por analizar que hace ${balance.days} días.`
              : "A este ritmo la cola se mantiene."}
        </p>
      </div>
    </section>
  );
}
