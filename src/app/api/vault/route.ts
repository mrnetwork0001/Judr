/**
 * The case's lifecycle, scoped to the caller's session.
 *
 * Identity: a wallet joins a role by signing a message the server verifies.
 * Money: release and review pay the winner on-chain through the escrow agent
 * between the vault's prepare and complete steps, so a refused transition
 * never reaches the chain and a failed transfer never marks the case settled.
 */

import { CHAIN, ensureFunded, escrowConfigured, NETWORK, payout } from "@/lib/escrow";
import { joinMessage, verifyJoin, type Role } from "@/lib/identity";
import { buildRedeem, ESCROW_AGENT, findVault, ixsVaults } from "@/lib/ixs";
import { sessionFor, withSession } from "@/lib/session";
import {
  abortSettlement,
  appeal,
  completeRelease,
  completeReview,
  getVault,
  joinAs,
  prepareRelease,
  prepareReview,
  recordFunding,
  resetVault,
  VaultError,
} from "@/lib/vault";
import type { Address } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const session = sessionFor(request);
  return withSession(Response.json(getVault(session.id)), session);
}

interface Body {
  action?: "reset" | "join-message" | "join" | "appeal" | "release" | "review";
  reason?: string;
  decision?: "uphold" | "overturn";
  note?: string;
  role?: Role;
  address?: string;
  signature?: string;
  /** The caller's wallet, for actions gated by role. */
  by?: string;
}

/** The IXS redemption request for wherever the agent decided the escrow sits. Unsigned. */
async function redeemFor(sessionId: string) {
  const current = getVault(sessionId);
  if (!current.allocation) return undefined;
  const snapshot = await ixsVaults();
  const v = findVault(snapshot, current.allocation.vaultId);
  if (!v) return undefined;
  const price = current.allocation.sharePrice ?? v.onchain?.sharePrice ?? 1;
  return buildRedeem(v, ESCROW_AGENT, (current.amount / price).toFixed(6));
}

/** Opening a case means the agent must actually hold the escrow. */
async function fund(sessionId: string) {
  const vault = getVault(sessionId);
  if (!escrowConfigured()) return vault;
  const funding = await ensureFunded(vault.amount);
  return recordFunding(sessionId, {
    agent: funding.address,
    network: NETWORK,
    explorerUrl: `${CHAIN.explorer}/address/${funding.address}`,
    usdc: funding.usdc,
    ...(funding.faucet[0] ? { faucetTx: funding.faucet[0].txHash } : {}),
    at: Date.now(),
  });
}

export async function POST(request: Request) {
  const session = sessionFor(request);
  const body = (await request.json().catch(() => ({}))) as Body;
  const json = (data: unknown, status = 200) => withSession(Response.json(data, { status }), session);

  try {
    switch (body.action) {
      case "reset": {
        resetVault(session.id);
        return json(await fund(session.id));
      }

      case "join-message": {
        if (!body.role || !body.address) return json({ error: "role and address are required." }, 400);
        return json({ message: joinMessage(getVault(session.id).id, body.role, session.id, body.address as Address) });
      }

      case "join": {
        if (!body.role || !body.address || !body.signature) return json({ error: "role, address and signature are required." }, 400);
        const verified = await verifyJoin({
          vaultId: getVault(session.id).id,
          role: body.role,
          sessionId: session.id,
          address: body.address,
          signature: body.signature,
        });
        if (!verified.ok) return json({ error: verified.error }, 401);
        return json(joinAs(session.id, body.role, verified.address));
      }

      case "appeal":
        return json(appeal(session.id, body.reason ?? "Appeal lodged by the losing party", body.by));

      case "release": {
        const { payee, amount } = prepareRelease(session.id);
        try {
          if (!escrowConfigured()) return json({ error: "Escrow agent is not configured; there is no wallet to pay from." }, 503);
          const paid = await payout(payee.address as Address, amount);
          return json(completeRelease(session.id, paid, await redeemFor(session.id)));
        } catch (error) {
          abortSettlement(session.id);
          throw error;
        } finally {
          // A refusal above returned without paying; make sure the lock is not left set.
          if (getVault(session.id).status !== "released") abortSettlement(session.id);
        }
      }

      case "review": {
        if (body.decision !== "uphold" && body.decision !== "overturn") return json({ error: "decision must be uphold or overturn." }, 400);
        const note = String(body.note ?? "").slice(0, 600);
        const { payee, amount } = prepareReview(session.id, body.decision, note, body.by);
        try {
          if (!escrowConfigured()) return json({ error: "Escrow agent is not configured; there is no wallet to pay from." }, 503);
          const paid = await payout(payee.address as Address, amount);
          return json(completeReview(session.id, body.decision, note, paid, await redeemFor(session.id)));
        } catch (error) {
          abortSettlement(session.id);
          throw error;
        } finally {
          if (getVault(session.id).status !== "released") abortSettlement(session.id);
        }
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    const status = error instanceof VaultError ? 409 : 500;
    return json({ error: error instanceof Error ? error.message : String(error) }, status);
  }
}
