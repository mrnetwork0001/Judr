/**
 * Vault state and lifecycle actions, scoped to the caller's session.
 *
 * Release is a separate, explicit call that the mock contract refuses to honour
 * before the appeal window closes — the check lives with the funds, not with
 * the caller. Refused transitions come back as 409 with the reason.
 */

import { sessionFor, withSession } from "@/lib/session";
import { appeal, getVault, release, resetVault, VaultError } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = sessionFor(request);
  return withSession(Response.json(getVault(session.id)), session);
}

export async function POST(request: Request) {
  const session = sessionFor(request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: "reset" | "appeal" | "release";
    reason?: string;
  };

  try {
    switch (body.action) {
      case "reset":
        return withSession(Response.json(resetVault(session.id)), session);
      case "appeal":
        return withSession(
          Response.json(appeal(session.id, body.reason ?? "Appeal lodged by the losing party")),
          session,
        );
      case "release":
        return withSession(Response.json(release(session.id)), session);
      default:
        return withSession(Response.json({ error: "Unknown action." }, { status: 400 }), session);
    }
  } catch (error) {
    const status = error instanceof VaultError ? 409 : 500;
    return withSession(
      Response.json({ error: error instanceof Error ? error.message : String(error) }, { status }),
      session,
    );
  }
}
