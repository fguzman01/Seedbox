import Link from "next/link";
import { formatAge } from "@/lib/analyst-status";
import { VERTICAL_LABELS } from "@/lib/pains";
import {
  activityHref,
  DEV_VERTICAL,
  type ActivityFilter,
  type MixCounts,
  type SourceMix,
  type SourceMixSummary,
  type SourceState,
} from "@/lib/source-mix";

const dateTimeFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

const STATE_BADGES: Record<SourceState, { label: string; className: string } | null> = {
  ok: null,
  unknown: null,
  not_configured: { label: "no configurada", className: "bg-amber-500/15 text-amber-300" },
  error: { label: "falló la última ingesta", className: "bg-red-500/15 text-red-300" },
};

function NumberLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`hover:text-emerald-300 hover:underline ${className}`}>
      {children}
    </Link>
  );
}

/** Filters shared by every number of a source or subreddit card. */
type Scope = Pick<ActivityFilter, "source" | "subreddit" | "days">;

function CountStats({ counts, scope }: { counts: MixCounts; scope: Scope }) {
  const stats = [
    { label: "Ingresados", value: counts.ingested, href: activityHref({ list: "posts", stage: "ingested", ...scope }) },
    { label: "Procesados", value: counts.processed, href: activityHref({ list: "posts", stage: "processed", ...scope }) },
    {
      label: "Descartados",
      value: counts.discarded,
      href: activityHref({ list: "posts", stage: "discarded", ...scope }),
    },
    { label: "Dolores", value: counts.pains, href: activityHref({ list: "pains", ...scope }) },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="text-xs text-zinc-500">{s.label}</dt>
          <dd className="mt-0.5 text-xl font-semibold text-zinc-100">
            <NumberLink href={s.href}>{s.value}</NumberLink>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VerticalMix({ counts, scope }: { counts: MixCounts; scope: Scope }) {
  if (counts.pains === 0) return <p className="text-xs text-zinc-600">Sin dolores en el período.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {counts.verticals.map((v) => {
        const dev = v.vertical === DEV_VERTICAL;
        return (
          <li key={v.vertical}>
            <NumberLink
              href={activityHref({ list: "pains", vertical: v.vertical, ...scope })}
              className="flex items-center gap-2"
            >
              <span className={`w-40 shrink-0 truncate ${dev ? "font-medium text-amber-300" : "text-zinc-400"}`}>
                {VERTICAL_LABELS[v.vertical]}
              </span>
              <span className="h-1.5 flex-1 rounded bg-zinc-800">
                <span
                  className={`block h-1.5 rounded ${dev ? "bg-amber-400" : "bg-emerald-500/60"}`}
                  style={{ width: `${v.percent}%` }}
                />
              </span>
              <span className={`w-16 text-right tabular-nums ${dev ? "text-amber-300" : "text-zinc-300"}`}>
                {v.percent} % <span className="text-xs text-zinc-600">({v.pains})</span>
              </span>
            </NumberLink>
          </li>
        );
      })}
    </ul>
  );
}

function DevShare({ counts, scope }: { counts: MixCounts; scope: Scope }) {
  if (counts.devPercent === null) return null;
  return (
    <p className="text-sm text-zinc-400">
      <NumberLink
        href={activityHref({ list: "pains", vertical: DEV_VERTICAL, ...scope })}
        className="text-2xl font-semibold text-amber-300"
      >
        {counts.devPercent} %
      </NumberLink>{" "}
      de los dolores en {VERTICAL_LABELS[DEV_VERTICAL]}
    </p>
  );
}

function LastRun({ source, now }: { source: SourceMix; now: Date }) {
  const run = source.lastRun;
  if (!run) return <p className="text-xs text-zinc-600">Sin ingestas registradas.</p>;
  const when = `${dateTimeFormat.format(run.ranAt)} (${formatAge(run.ranAt, now)})`;
  if (run.status === "skipped") {
    return (
      <p className="text-xs text-amber-200/80">
        La última ingesta ({when}) la omitió por falta de configuración. Ver <code>docs/deploy.md</code>.
      </p>
    );
  }
  if (run.status === "error") return <p className="text-xs text-red-300/80">La última ingesta ({when}) falló.</p>;
  return (
    <p className="text-xs text-zinc-600">
      Última ingesta: {when} · {run.inserted} posts nuevos
    </p>
  );
}

function SubredditTable({ source, days }: { source: SourceMix; days: number }) {
  if (source.subreddits.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left text-xs text-zinc-500">Por subreddit</caption>
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className="py-1 text-left font-normal">Subreddit</th>
            <th className="py-1 text-right font-normal">Ingresados</th>
            <th className="py-1 text-right font-normal">Procesados</th>
            <th className="py-1 text-right font-normal">Descartados</th>
            <th className="py-1 text-right font-normal">Dolores</th>
            <th className="py-1 text-right font-normal">% devs</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {source.subreddits.map((sub) => {
            const scope: Scope = { source: source.source, subreddit: sub.subreddit, days };
            return (
              <tr key={sub.subreddit} className="border-t border-zinc-800">
                <td className="py-1.5 text-zinc-300">r/{sub.subreddit}</td>
                <td className="py-1.5 text-right">
                  <NumberLink href={activityHref({ list: "posts", stage: "ingested", ...scope })}>{sub.ingested}</NumberLink>
                </td>
                <td className="py-1.5 text-right">
                  <NumberLink href={activityHref({ list: "posts", stage: "processed", ...scope })}>{sub.processed}</NumberLink>
                </td>
                <td className="py-1.5 text-right">
                  <NumberLink href={activityHref({ list: "posts", stage: "discarded", ...scope })}>{sub.discarded}</NumberLink>
                </td>
                <td className="py-1.5 text-right">
                  <NumberLink href={activityHref({ list: "pains", ...scope })}>{sub.pains}</NumberLink>
                </td>
                <td className="py-1.5 text-right text-amber-300">
                  {sub.devPercent === null ? (
                    <span className="text-zinc-600">–</span>
                  ) : (
                    <NumberLink href={activityHref({ list: "pains", vertical: DEV_VERTICAL, ...scope })}>
                      {sub.devPercent} %
                    </NumberLink>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourceCard({ source, days, now }: { source: SourceMix; days: number; now: Date }) {
  const scope: Scope = { source: source.source, days };
  const badge = STATE_BADGES[source.state];
  const empty = source.ingested === 0 && source.processed === 0 && source.pains === 0;
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-zinc-100">{source.name}</h3>
        {badge && <span className={`rounded px-1.5 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>}
        {source.ingestedPercent !== null && (
          <span className="ml-auto text-xs text-zinc-500">
            <NumberLink href={activityHref({ list: "posts", stage: "ingested", ...scope })} className="text-zinc-300">
              {source.ingestedPercent} %
            </NumberLink>{" "}
            de los posts ingresados
          </span>
        )}
      </div>
      <div className="mt-1">
        <LastRun source={source} now={now} />
      </div>

      {empty ? (
        <p className="mt-4 text-sm text-zinc-500">
          {source.state === "not_configured"
            ? "No configurada: no se ingieren posts de esta fuente."
            : `Sin posts en los últimos ${days} días.`}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <CountStats counts={source} scope={scope} />
          </div>
          <div className="mt-4">
            <DevShare counts={source} scope={scope} />
          </div>
          <div className="mt-3">
            <VerticalMix counts={source} scope={scope} />
          </div>
          <SubredditTable source={source} days={days} />
        </>
      )}
    </li>
  );
}

export function SourceMixSection({ mix, now }: { mix: SourceMixSummary; now: Date }) {
  return (
    <section className="mb-10" aria-labelledby="source-mix">
      <h2 id="source-mix" className="text-lg font-semibold">
        De dónde viene el radar
      </h2>
      <p className="mt-1 mb-4 text-sm text-zinc-500">
        Últimos {mix.days} días, por fuente: posts ingresados, procesados (con dolores o descartados), descartados
        sin dolores y dolores extraídos, con su reparto por vertical. Cada número abre la lista correspondiente.
      </p>
      <ul className="grid gap-4 lg:grid-cols-2">
        {mix.sources.map((source) => (
          <SourceCard key={source.source} source={source} days={mix.days} now={now} />
        ))}
      </ul>
    </section>
  );
}
