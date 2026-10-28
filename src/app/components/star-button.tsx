"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleStar } from "../opportunities/actions";

export function StarButton({
  opportunityId,
  starred,
  size = "sm",
}: {
  opportunityId: number;
  starred: boolean;
  size?: "sm" | "lg";
}) {
  const [optimistic, setOptimistic] = useOptimistic(starred);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onClick() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await toggleStar(opportunityId, next);
      // On failure the optimistic state rolls back when the transition ends.
      if (!result.ok) setError(result.error);
    });
  }

  const label = optimistic ? "Quitar de favoritas" : "Marcar como favorita";
  return (
    <span className="relative z-10 inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={optimistic}
        aria-label={label}
        title={error ?? label}
        className={`leading-none transition hover:scale-110 ${size === "lg" ? "text-2xl" : "text-lg"} ${
          optimistic ? "text-amber-300" : "text-zinc-600 hover:text-zinc-400"
        }`}
      >
        {optimistic ? "★" : "☆"}
      </button>
      {error && size === "lg" && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
