/**
 * Vault state and lifecycle actions, scoped to the caller's session.
 *
 * Release is a separate, explicit call that the mock contract refuses to honour
 * before the appeal window closes — the check lives with the funds, not with
 * the caller. Refused transitions come back as 409 with the reason.
 */

import { buildRedeem, ESCROW_AGENT, findVault, ixsVaults } from "@/lib/ixs";
import { sessionFor, withSession } from "@/lib/session";
import { appeal, getVault, release, resetVault, review, VaultError } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = sessionFor(request);
  return withSession(Response.json(getVault(session.id)), session);
}

export async function POST(request: Request) {
  const session = sessionFor(request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: "reset" | "appeal" | "release" | "review";
    reason?: string;
    decision?: "uphold" | "overturn";
    note?: string;
  };

  /** The redemption request for wherever the escrow sits. Unsigned. */
  const redeemFor = async () => {
    const current = getVault(session.id);
    if (!current.allocation) return undefined;
    const snapshot = await ixsVaults();
    const v = findVault(snapshot, current.allocation.vaultId);
    if (!v) return undefined;
    const price = current.allocation.sharePrice ?? v.onchain?.sharePrice ?? 1;
    return buildRedeem(v, ESCROW_AGENT, (current.amount / price).toFixed(6));
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
        return withSession(Response.json(release(session.id, await redeemFor())), session);
      case "review": {
        if (body.decision !== "uphold" && body.decision !== "overturn") {
          return withSession(Response.json({ error: "decision must be uphold or overturn." }, { status: 400 }), session);
        }
        return withSession(
          Response.json(review(session.id, body.decision, String(body.note ?? "").slice(0, 600), await redeemFor())),
          session,
        );
      }
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
