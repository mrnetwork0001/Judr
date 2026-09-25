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

/** A refused transition. The API maps these to 409; anything else is a 500. */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

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

/**
 * Demo appeal window. Long enough to read the verdict and lodge an appeal,
 * short enough not to stall a demo. A real deployment would measure this in days.
 */
export const APPEAL_WINDOW_MS = Number(process.env.JUDR_APPEAL_WINDOW_MS ?? "20000");

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

/**
 * One vault per browser session, not one global. A public demo is opened by
 * several judges at once, and with a single shared vault the second visitor's
 * reset lands in the middle of the first visitor's run.
 *
 * Kept on globalThis so it survives dev-server hot reloads, and capped so an
 * anonymous caller cannot grow it without bound.
 */
const MAX_SESSIONS = 500;

const store = globalThis as unknown as { __judrVaults?: Map<string, Vault> };

function vaults(): Map<string, Vault> {
  if (!store.__judrVaults) store.__judrVaults = new Map();
  return store.__judrVaults;
}

export function getVault(sessionId: string): Vault {
  const all = vaults();
  let vault = all.get(sessionId);
  if (!vault) {
    vault = freshVault();
    all.set(sessionId, vault);
    // Map iterates in insertion order, so the first key is the oldest session.
    while (all.size > MAX_SESSIONS) {
      const oldest = all.keys().next().value;
      if (oldest === undefined) break;
      all.delete(oldest);
    }
  }
  return vault;
}

/** A fresh vault for rendering only — never stored, never mutated. */
export function previewVault(): Vault {
  return freshVault();
}

export function resetVault(sessionId: string): Vault {
  const vault = freshVault();
  vaults().set(sessionId, vault);
  return vault;
}

/**
 * A vault under appeal is closed to new arbitration. That is the whole point
 * of an appeal: nothing Judr does afterwards may move the funds until a human
 * has looked. Without this guard a second run silently cleared the appeal and
 * the escrow released with "Appeal lodged" still in the log.
 */
export function raiseDispute(sessionId: string, reason: string): Vault {
  const vault = getVault(sessionId);
  if (vault.status === "released") {
    throw new VaultError("Vault already released.");
  }
  if (vault.status === "appealed") {
    throw new VaultError("Vault is under appeal; it is closed to further arbitration until a human reviews it.");
  }
  if (vault.status === "verdict_posted") {
    throw new VaultError("A verdict is already posted and its appeal window is open.");
  }
  vault.status = "disputed";
  vault.events.push({ at: Date.now(), label: "Dispute raised", detail: reason });
  return vault;
}

/**
 * Judr acting as oracle. Posts the verdict and starts the appeal window; does
 * not move funds.
 */
export function postVerdict(sessionId: string, result: ArbitrationResult): Vault {
  const vault = getVault(sessionId);
  if (vault.status !== "disputed") {
    throw new VaultError(`Cannot post a verdict on a vault that is ${vault.status.replace("_", " ")}.`);
  }
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

export function appeal(sessionId: string, reason: string): Vault {
  const vault = getVault(sessionId);
  if (vault.status !== "verdict_posted") {
    throw new VaultError("No verdict is currently open to appeal.");
  }
  if (Date.now() > (vault.verdict?.appealDeadline ?? 0)) {
    throw new VaultError("The appeal window has closed.");
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
export function release(sessionId: string): Vault {
  const vault = getVault(sessionId);
  if (vault.status === "released") return vault;
  if (vault.status === "appealed") {
    throw new VaultError("Verdict is under appeal; release is halted.");
  }
  if (vault.status !== "verdict_posted" || !vault.verdict) {
    throw new VaultError("No verdict has been posted for this vault.");
  }
  if (Date.now() < vault.verdict.appealDeadline) {
    throw new VaultError("Appeal window has not closed yet.");
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
