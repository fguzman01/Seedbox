/** Lowercases and collapses whitespace and quote styles so small formatting diffs still match. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether `quote` appears in the post (title or body), ignoring formatting differences. */
export function quoteAppearsIn(quote: string, post: { title: string | null; body: string }): boolean {
  const needle = normalizeText(quote);
  return needle.length > 0 && normalizeText(`${post.title ?? ""}\n${post.body}`).includes(needle);
}
