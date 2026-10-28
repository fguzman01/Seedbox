import { AXES, AXIS_LABELS, type AxisScores, type TotalScore } from "@/lib/scoring";

function scoreColor(score: number) {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 4) return "bg-amber-400";
  return "bg-zinc-500";
}

export function TotalBadge({ score, size = "sm" }: { score: TotalScore; size?: "sm" | "lg" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-semibold text-zinc-100 ${size === "lg" ? "text-4xl" : "text-2xl"}`}>
        {score.total.toFixed(1)}
      </span>
      <span className="text-xs text-zinc-500">/ 10</span>
      {score.partial && (
        <span
          className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400"
          title="Faltan ejes por evaluar (npm run assess); el total usa sólo los disponibles."
        >
          parcial
        </span>
      )}
    </div>
  );
}

/** One thin bar per axis; compact for cards, labeled for the detail page. */
export function AxisBars({ axes, labeled = false }: { axes: AxisScores; labeled?: boolean }) {
  return (
    <ul className={labeled ? "space-y-3" : "grid grid-cols-5 gap-1.5"}>
      {AXES.map((axis) => {
        const score = axes[axis];
        return (
          <li key={axis} title={`${AXIS_LABELS[axis]}: ${score === null ? "sin evaluar" : score}`}>
            {labeled && (
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-zinc-300">{AXIS_LABELS[axis]}</span>
                <span className="text-zinc-400">{score === null ? "sin evaluar" : score.toFixed(1)}</span>
              </div>
            )}
            <div className={`overflow-hidden rounded-full bg-zinc-800 ${labeled ? "h-2" : "h-1.5"}`}>
              {score !== null && (
                <div className={`h-full ${scoreColor(score)}`} style={{ width: `${score * 10}%` }} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
