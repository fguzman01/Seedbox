/**
 * Weak evidence (H12): an opportunity backed by a single distinct author may be one person's
 * anecdote rather than a shared pain. The mark is derived from `authorCount` on every read, so an
 * opportunity stops being weak as soon as clustering adds a second author; nothing is stored.
 *
 * A distinct author is a (source, author) pair, as counted by `scoringEvidence.authorCount` in
 * `queries.ts`: the same name on two sources counts twice, because usernames are not shared
 * across sources. Signals without an author are not counted, since they cannot prove a second
 * person. The frequency axis uses the same count, so the mark only makes visible what it measures.
 */

/** Opportunities with at most this many distinct authors are marked as weak evidence. */
export const WEAK_EVIDENCE_MAX_AUTHORS = 1;

export function isWeakEvidence(authorCount: number): boolean {
  return authorCount <= WEAK_EVIDENCE_MAX_AUTHORS;
}

/** The hover / screen reader explanation of the "evidencia débil" mark. */
export function weakEvidenceExplanation(authorCount: number): string {
  const who =
    authorCount === 0
      ? "Ninguna de sus señales tiene un autor identificable"
      : "Sólo una persona contó este dolor";
  return `${who}: puede ser una anécdota y no un dolor compartido. Deja de ser débil cuando otro autor distinto (en cualquier fuente) cuenta lo mismo.`;
}

/** Choices of the "minimum distinct authors" filter; the last one means "or more". */
export const MIN_AUTHOR_OPTIONS = [1, 2, 3] as const;
export type MinAuthors = (typeof MIN_AUTHOR_OPTIONS)[number];

export const MIN_AUTHOR_LABELS: Record<MinAuthors, string> = {
  1: "Cualquier nº de autores",
  2: "Autores distintos ≥ 2",
  3: "Autores distintos ≥ 3",
};

/** 1 is the default and filters nothing, so opportunities without identifiable authors stay listed. */
export function meetsMinAuthors(authorCount: number, minAuthors: MinAuthors): boolean {
  return minAuthors <= 1 || authorCount >= minAuthors;
}
