import { checkAgentToken } from "@/lib/auth";

/** Returns an error response when the request lacks the analyst token, or null when it may go on. */
export function rejectUnauthorized(request: Request): Response | null {
  const access = checkAgentToken({
    authorization: request.headers.get("authorization"),
    agentToken: request.headers.get("x-seedbox-agent-token"),
  });
  if (access.ok) return null;
  // 404 when the API is disabled, so its existence is not advertised.
  return access.status === 404
    ? Response.json({ error: "not found" }, { status: 404 })
    : Response.json({ error: "invalid agent token" }, { status: 401 });
}
