/**
 * Browser sessions for the demo vault.
 *
 * Each visitor gets an opaque id in an httpOnly cookie, and the vault store is
 * keyed by it. There is no account and nothing personal in the cookie; it only
 * keeps one judge's demo from resetting another's.
 */

import { randomUUID } from "node:crypto";

export const SESSION_COOKIE = "judr_sid";
const ONE_DAY = 60 * 60 * 24;

export interface Session {
  id: string;
  /** True when this request had no cookie and one must be set on the response. */
  isNew: boolean;
}

export function readSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return /^[0-9a-f-]{36}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function sessionFor(request: Request): Session {
  const existing = readSessionId(request.headers.get("cookie"));
  return existing ? { id: existing, isNew: false } : { id: randomUUID(), isNew: true };
}

/** Appends the Set-Cookie header when the session was minted on this request. */
export function withSession(response: Response, session: Session): Response {
  if (!session.isNew) return response;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${session.id}; Path=/; Max-Age=${ONE_DAY}; HttpOnly; SameSite=Lax${secure}`,
  );
  return response;
}
