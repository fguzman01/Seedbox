import type { Attribution } from "@/lib/sources/attribution";

const linkClass = "text-zinc-400 underline decoration-zinc-700 hover:text-emerald-300";

/** CC BY-SA credit under a Stack Exchange quote (ADR-0010): site, question, author and license. */
export function AttributionLine({ attribution: a, className = "" }: { attribution: Attribution; className?: string }) {
  return (
    <p className={`text-xs text-zinc-500 not-italic ${className}`}>
      Stack Exchange · {a.site} ·{" "}
      <a href={a.questionUrl} target="_blank" rel="noreferrer" className={linkClass}>
        pregunta
      </a>
      {a.author && (
        <>
          {" "}
          de{" "}
          {a.authorUrl ? (
            <a href={a.authorUrl} target="_blank" rel="noreferrer" className={linkClass}>
              {a.author}
            </a>
          ) : (
            a.author
          )}
        </>
      )}{" "}
      · licencia{" "}
      <a href={a.licenseUrl} target="_blank" rel="noreferrer license" className={linkClass}>
        {a.license}
      </a>
    </p>
  );
}
