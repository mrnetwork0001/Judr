/**
 * Allocation endpoint: where should the escrow sit?
 *
 * Reads the live IXS vault list, asks the SERV allocation step (or serves the
 * recorded decision when no key is configured), runs the proposal through the
 * deterministic policy, and applies the outcome to the caller's vault -
 * allocated, held as cash, or refused. Every branch is written to the vault's
 * log, and the unsigned subscription request is returned so the trail shows
 * what a signer would send.
 */

import { allocate, checkAllocation, type AllocationDecision } from "@/lib/graph/allocate";
import { buildDeposit, ESCROW_AGENT, ixsVaults } from "@/lib/ixs";
import { hasServKey } from "@/lib/serv";
import { sessionFor, withSession } from "@/lib/session";
import {
  allocationFrom,
  getVault,
  holdAllocation,
  holdCash,
  refuseAllocation,
  setAllocation,
  VaultError,
} from "@/lib/vault";

import { readPosition } from "@/lib/ixs-position";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  // The vault list and the agent's standing position, for the panel.
  const [snapshot, position] = await Promise.all([ixsVaults(), readPosition()]);
  return Response.json({ ...snapshot, position });
}

export async function POST(request: Request) {
  const session = sessionFor(request);
  const vault = getVault(session.id);
  if (!hasServKey()) {
    return withSession(Response.json({ error: "SERV_API_KEY is not set; the allocation step runs live on SERV." }, { status: 503 }), session);
  }
  const [snapshot, position] = await Promise.all([ixsVaults(), readPosition()]);
  const startedAt = Date.now();
  const positionLine =
    position.status === "none" || position.error
      ? undefined
      : `${position.vaultName ?? "IX High Yield Bond (USDC)"} on ${position.chain.name} (${position.vault}): ${position.status === "pending" ? `${position.pendingUsdc || position.request?.assetsUsdc} USDC requested, awaiting IXS finalisation` : `${Number(position.shares).toFixed(4)} shares worth ${Number(position.valueUsdc).toFixed(2)} USDC at ${position.sharePriceUsdc}`}. Cases account against this standing position; no per-case deposit is sent.`;

  let decision: AllocationDecision;
  let engine: string;
  let repairs = 0;
  try {
    const result = await allocate({
      snapshot,
      escrow: { amount: vault.amount, asset: vault.asset },
      expectedDays: 30,
      position: positionLine,
      signal: request.signal,
    });
    decision = result.value;
    engine = result.model;
    repairs = result.repairs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withSession(Response.json({ error: `allocation step failed: ${message}` }, { status: 502 }), session);
  }

  const check = checkAllocation(decision, snapshot);
  const source = "live" as const;

  try {
    let outcome: "allocated" | "held" | "cash" | "refused";
    if (!check.accepted) {
      refuseAllocation(session.id, check.reasons);
      outcome = "refused";
    } else if (!decision.allocate || !check.vault) {
      holdCash(session.id, decision.rationale);
      outcome = "cash";
    } else if (vault.allocation && vault.allocation.vaultId === check.vault.id) {
      // Same vault: stay put. Re-depositing would reset the accrual clock.
      holdAllocation(session.id, decision.rationale, source);
      outcome = "held";
    } else {
      const tx = buildDeposit(check.vault, ESCROW_AGENT, String(vault.amount));
      setAllocation(session.id, allocationFrom(check.vault, decision, tx, source));
      outcome = "allocated";
    }

    return withSession(
      Response.json({
        outcome,
        decision,
        check: { accepted: check.accepted, reasons: check.reasons },
        record: {
          step: "allocate",
          label: "Allocating the escrow",
          startedAt,
          endedAt: Date.now(),
          model: engine,
          validated: true,
          repairs,
        },
        snapshot: { source: snapshot.source, fetchedAt: snapshot.fetchedAt, count: snapshot.vaults.length },
        vault: getVault(session.id),
      }),
      session,
    );
  } catch (error) {
    const status = error instanceof VaultError ? 409 : 500;
    return withSession(
      Response.json({ error: error instanceof Error ? error.message : String(error) }, { status }),
      session,
    );
  }
}
