/**
 * Mock IXS vault.
 *
 * Stands in for the escrow contract: holds a balance against a contract, moves
 * to `disputed` when a party raises a dispute, and accepts a signed verdict
 * from Judr acting as the resolution oracle.
 *
 * The one piece of real design here is the appeal window. Judr does not move
 * money the instant a model reaches a conclusion. The verdict is posted with
 * its digest and reasoning, and the transfer executes only after the window
 * closes without an appeal. That is what makes the system safe to be wrong
 * occasionally: being wrong costs a delay, not somebody's ten thousand dollars.
 *
 * In-memory on purpose — this is the mock. The state machine and the digest are
 * what a real deployment would keep; the storage is not.
 */

import type { ArbitrationResult, Party, PartyRef } from "./types";

export type VaultStatus =
  | "funded"
  | "disputed"
  | "verdict_posted"
  | "released"
  | "appealed";

export interface VaultEvent {
  at: number;
  label: string;
  detail?: string;
}

export interface Vault {
  id: string;
  contractTitle: string;
  asset: string;
  amount: number;
  plaintiff: PartyRef;
  defendant: PartyRef;
  status: VaultStatus;
  /** Set once a verdict is posted. */
  verdict?: {
    disputeId: string;
    winner: Party;
    payee: PartyRef;
    digest: string;
    confidence: number;
    postedAt: number;
    /** Funds may not move before this timestamp. */
    appealDeadline: number;
  };
  releasedTo?: PartyRef;
  events: VaultEvent[];
}

/** Demo appeal window. A real deployment would measure this in days. */
export const APPEAL_WINDOW_MS = Number(process.env.JUDR_APPEAL_WINDOW_MS ?? "45000");

const VAULT_ID = "IXS-VLT-4417";

function freshVault(): Vault {
  return {
    id: VAULT_ID,
    contractTitle: "Web Development Services Agreement",
    asset: "USDC",
    amount: 10000,
    plaintiff: { name: "A. Moreau (Contractor)", address: "0xA11CE…4f2b" },
    defendant: { name: "B. Adeyemi (Client)", address: "0xB0B…91d7" },
    status: "funded",
    events: [
      { at: Date.parse("2026-08-25T10:04:00Z"), label: "Vault funded", detail: "10,000.00 USDC deposited by B. Adeyemi" },
      { at: Date.parse("2026-08-25T10:04:00Z"), label: "Agreement bound", detail: "Web Development Services Agreement — IXS-VLT-4417" },
    ],
  };
}

/** Survives dev-server hot reloads, which otherwise reset the demo mid-run. */
const store = globalThis as unknown as { __judrVault?: Vault };

export function getVault(): Vault {
  if (!store.__judrVault) store.__judrVault = freshVault();
  return store.__judrVault;
}

export function resetVault(): Vault {
  store.__judrVault = freshVault();
  return store.__judrVault;
}

export function raiseDispute(reason: string): Vault {
  const vault = getVault();
  if (vault.status === "released") {
    throw new Error("Vault already released.");
  }
  vault.status = "disputed";
  vault.events.push({ at: Date.now(), label: "Dispute raised", detail: reason });
  return vault;
}

/**
 * Judr acting as oracle. Posts the verdict and starts the appeal window; does
 * not move funds.
 */
export function postVerdict(result: ArbitrationResult): Vault {
  const vault = getVault();
  const payee = result.verdict.winner === "plaintiff" ? vault.plaintiff : vault.defendant;
  const postedAt = Date.now();

  vault.status = "verdict_posted";
  vault.verdict = {
    disputeId: result.disputeId,
    winner: result.verdict.winner,
    payee,
    digest: result.digest,
    confidence: result.confidence.score,
    postedAt,
    appealDeadline: postedAt + APPEAL_WINDOW_MS,
  };
  vault.events.push({
    at: postedAt,
    label: "Verdict posted by Judr",
    detail: `In favour of ${payee.name} · digest ${result.digest.slice(0, 16)}… · appeal window open`,
  });
  return vault;
}

export function appeal(reason: string): Vault {
  const vault = getVault();
  if (vault.status !== "verdict_posted") {
    throw new Error("No verdict is currently open to appeal.");
  }
  if (Date.now() > (vault.verdict?.appealDeadline ?? 0)) {
    throw new Error("The appeal window has closed.");
  }
  vault.status = "appealed";
  vault.events.push({
    at: Date.now(),
    label: "Appeal lodged",
    detail: `${reason} — release halted, escalated to human review`,
  });
  return vault;
}

/** The transfer. Refuses to run early, or on an appealed verdict. */
export function release(): Vault {
  const vault = getVault();
  if (vault.status === "released") return vault;
  if (vault.status === "appealed") {
    throw new Error("Verdict is under appeal; release is halted.");
  }
  if (vault.status !== "verdict_posted" || !vault.verdict) {
    throw new Error("No verdict has been posted for this vault.");
  }
  if (Date.now() < vault.verdict.appealDeadline) {
    throw new Error("Appeal window has not closed yet.");
  }

  vault.status = "released";
  vault.releasedTo = vault.verdict.payee;
  vault.events.push({
    at: Date.now(),
    label: "Escrow released",
    detail: `${vault.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${vault.asset} → ${vault.verdict.payee.name} (${vault.verdict.payee.address})`,
  });
  return vault;
}
