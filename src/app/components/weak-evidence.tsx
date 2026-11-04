import { isWeakEvidence, weakEvidenceExplanation } from "@/lib/evidence";

/**
 * "Evidencia débil" mark (H12). The explanation shows on hover and on keyboard focus, and screen
 * readers get it through aria-describedby. Renders nothing for opportunities with 2+ authors.
 */
export function WeakEvidenceBadge({ authorCount, id }: { authorCount: number; id: string }) {
  if (!isWeakEvidence(authorCount)) return null;
  const tooltipId = `${id}-explanation`;
  return (
    // relative z-10 keeps it above the card's stretched link, so hover and focus reach it.
    <span className="group relative z-10 inline-flex">
      <span
        tabIndex={0}
        aria-describedby={tooltipId}
        className="cursor-help rounded bg-rose-500/15 px-1.5 py-0.5 text-xs text-rose-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
      >
        evidencia débil
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="invisible absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-300 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {weakEvidenceExplanation(authorCount)}
      </span>
    </span>
  );
}
