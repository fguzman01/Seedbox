const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  times: "×",
};

/** Decodes numeric and common named HTML entities in a single pass, so "&amp;lt;" becomes "&lt;". */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = /<\/?(?:p|div|blockquote|h[1-6]|pre|ul|ol|hr|table|tr)\b[^>]*>/gi;

/**
 * Converts the HTML that Hacker News and Stack Exchange send into plain text: blocks become line
 * breaks, list items start with "- ", links keep their text (not the URL) and images are dropped.
 * Entities are decoded last, so markup shown as text inside code stays text.
 */
export function htmlToText(html: string): string {
  const text = html
    // Source indentation around list tags is not content; dropping it keeps items on consecutive lines.
    .replace(/\s*(<\/?(?:ul|ol|li)\b[^>]*>)\s*/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(BLOCK_TAGS, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
