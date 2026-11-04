import { hostOf } from "./types";

/**
 * CC BY-SA attribution for quotes from Stack Exchange (ADR-0010, point 2): the question link, the
 * author with a link to their profile, the site and the license with a link to its text.
 */
export interface Attribution {
  questionUrl: string;
  author: string | null;
  /** Null when the user no longer exists: then only the name is shown. */
  authorUrl: string | null;
  /** E.g. "money.stackexchange.com". */
  site: string;
  license: string;
  licenseUrl: string;
}

/** Explains which CC BY-SA version applies by date, for questions stored without `content_license`. */
const LICENSING_HELP_URL = "https://stackoverflow.com/help/licensing";

/** Link to the text of a Stack Exchange content license ("CC BY-SA 4.0" → creativecommons.org). */
export function licenseUrl(license: string | null | undefined): string | null {
  const version = /^CC BY-SA (\d\.\d)$/i.exec(license?.trim() ?? "")?.[1];
  return version ? `https://creativecommons.org/licenses/by-sa/${version}/` : null;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

/** The attribution to show next to a quote, or null when the source does not need one. */
export function attributionFor(item: {
  source: string;
  url: string;
  author?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
}): Attribution | null {
  if (item.source !== "stackexchange") return null;
  const metadata = item.sourceMetadata ?? {};
  const license = text(metadata.license);
  return {
    questionUrl: item.url,
    author: text(item.author),
    authorUrl: text(metadata.ownerLink),
    site: hostOf(item.url) ?? text(metadata.site) ?? "stackexchange.com",
    license: license ?? "CC BY-SA",
    licenseUrl: licenseUrl(license) ?? LICENSING_HELP_URL,
  };
}
