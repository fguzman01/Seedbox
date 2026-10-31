import { INTENSITY_LABELS, VERTICAL_LABELS, WTP_LABELS } from "@/lib/pains";
import type { Pain } from "@/lib/db/schema";
import { sourceLabel } from "@/lib/sources/types";

type PainWithSource = Pick<
  Pain,
  "description" | "persona" | "quote" | "vertical" | "intensity" | "willingnessToPay"
> & {
  url: string;
  source: string;
  sourceMetadata?: Record<string, unknown> | null;
  author?: string | null;
};

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "emerald" | "amber" }) {
  const tones = {
    zinc: "bg-zinc-800 text-zinc-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    amber: "bg-amber-500/15 text-amber-300",
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function PainCard({ pain }: { pain: PainWithSource }) {
  const wtp = WTP_LABELS[pain.willingnessToPay];
  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="emerald">{VERTICAL_LABELS[pain.vertical]}</Badge>
        <Badge>{INTENSITY_LABELS[pain.intensity]}</Badge>
        {wtp && <Badge tone="amber">{wtp}</Badge>}
      </div>
      <p className="mt-2 font-medium text-zinc-100">{pain.description}</p>
      <p className="mt-1 text-sm text-zinc-500">{pain.persona}</p>
      <blockquote className="mt-3 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-400 italic">
        “{pain.quote}”
      </blockquote>
      <a
        href={pain.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 self-start text-xs text-emerald-400 hover:underline"
      >
        Ver fuente ({sourceLabel(pain.source, pain.sourceMetadata)}
        {pain.author ? ` · ${pain.author}` : ""}) →
      </a>
    </div>
  );
}
