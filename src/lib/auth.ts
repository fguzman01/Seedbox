import { timingSafeEqual } from "node:crypto";

/** Single-user access protection (ADR-0007). */

/** Returns "user:password" from an `Authorization: Basic …` header, or null. */
export function parseBasicAuth(header: string | null | undefined): string | null {
  const match = /^Basic\s+(\S+)$/i.exec(header?.trim() ?? "");
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    return decoded.includes(":") ? decoded : null;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Whether the header carries the expected "user:password" credentials. */
export function hasValidCredentials(header: string | null | undefined, expected: string): boolean {
  const credentials = parseBasicAuth(header);
  return credentials !== null && safeEqual(credentials, expected);
}

export type WriteAccess = { allowed: true } | { allowed: false; reason: string };

/**
 * Decides whether a server action may write data:
 * development is open, production needs SEEDBOX_BASIC_AUTH and matching credentials.
 */
export function checkWriteAccess(
  authorization: string | null | undefined,
  env: { NODE_ENV?: string; SEEDBOX_BASIC_AUTH?: string } = process.env,
): WriteAccess {
  const expected = env.SEEDBOX_BASIC_AUTH;
  if (!expected) {
    return env.NODE_ENV === "production"
      ? { allowed: false, reason: "Sitio en modo sólo lectura: configura SEEDBOX_BASIC_AUTH para editar." }
      : { allowed: true };
  }
  return hasValidCredentials(authorization, expected)
    ? { allowed: true }
    : { allowed: false, reason: "Credenciales inválidas." };
}
