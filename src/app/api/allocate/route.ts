/**
 * Allocation endpoint: where should the escrow sit?
 *
 * Reads the live IXS vault list, asks the SERV allocation step (or serves the
 * recorded decision when no key is configured), runs the proposal through the
 * deterministic policy, and applies the outcome to the caller's vault —
 * allocated, held as cash, or refused. Every branch is written to the vault's
 * log, and the unsigned subscription request is returned so the trail shows
 * what a signer would send.
 */

import { allocate, checkAllocation, RECORDED_DECISION, type AllocationDecision } from "@/lib/graph/allocate";
import { buildDeposit, ESCROW_AGENT, ixsVaults } from "@/lib/ixs";
import { hasServKey, servConfig } from "@/lib/serv";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  // The vault list on its own, for the panel and the landing page.
  return Response.json(await ixsVaults());
}

export async function POST(request: Request) {
  const session = sessionFor(request);
  const vault = getVault(session.id);
  const snapshot = await ixsVaults();
  const live = hasServKey();
  const startedAt = Date.now();

  let decision: AllocationDecision;
  let engine: string;
  let repairs = 0;
  try {
    if (live) {
      const result = await allocate({
        snapshot,
        escrow: { amount: vault.amount, asset: vault.asset },
        expectedDays: 30,
        signal: request.signal,
      });
      decision = result.value;
      engine = result.model;
      repairs = result.repairs;
    } else {
      decision = RECORDED_DECISION;
      engine = "recorded fixture — no model call";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withSession(Response.json({ error: `allocation step failed: ${message}` }, { status: 502 }), session);
  }

  const check = checkAllocation(decision, snapshot);
  const source = live ? "live" : "recorded";

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
          model: live ? servConfig().model : engine,
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
