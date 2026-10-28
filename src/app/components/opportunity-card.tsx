import Link from "next/link";
import type { getOpportunities } from "@/lib/queries";
import { VERTICAL_LABELS } from "@/lib/pains";
import { Badge } from "./pain-card";
import { AxisBars, TotalBadge } from "./score";

type ScoredOpportunity = Awaited<ReturnType<typeof getOpportunities>>[number];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function OpportunityCard({ opportunity: o, query }: { opportunity: ScoredOpportunity; query: string }) {
  const paying = o.willingnessImplied + o.willingnessExplicit;
  return (
    <article className="relative flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-500/50 hover:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="emerald">{VERTICAL_LABELS[o.mainVertical]}</Badge>
          {paying > 0 && <Badge tone="amber">{plural(paying, "señal de pago", "señales de pago")}</Badge>}
        </div>
        <TotalBadge score={o.score} />
      </div>

      <h3 className="mt-2 font-semibold text-zinc-100">
        {/* The stretched link makes the whole card clickable while the source link stays separate. */}
        <Link href={`/opportunities/${o.id}${query}`} className="after:absolute after:inset-0">
          {o.title}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-3 text-sm text-zinc-400">{o.summary}</p>

      <blockquote className="mt-3 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-400 italic">
        <span className="line-clamp-2">“{o.topQuote}”</span>
        <a
          href={o.topQuoteUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 mt-1 inline-block text-xs text-emerald-400 not-italic hover:underline"
        >
          Ver fuente →
        </a>
      </blockquote>

      <div className="mt-auto pt-4">
        <AxisBars axes={o.axes} />
      </div>
      <p className="pt-3 text-xs text-zinc-500">
        {plural(o.authorCount, "autor", "autores")} · {plural(o.signalCount, "post", "posts")} ·{" "}
        {plural(o.painCount, "dolor", "dolores")}
      </p>
    </article>
  );
}
