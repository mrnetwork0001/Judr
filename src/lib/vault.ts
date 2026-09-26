/**
 * The case record.
 *
 * A pure state machine over one escrow: who the parties are (proven wallet
 * addresses), where the money sits, the verdict, the appeal window, and how
 * it settled. The money itself is not here - it is testnet USDC held by the
 * escrow agent (see escrow.ts), and the API route moves it on-chain between
 * prepareRelease() and completeRelease(). Keeping the state machine free of
 * network calls is what keeps every refused transition testable.
 *
 * The one piece of real design here is the appeal window. Judr does not move
 * money the instant a model reaches a conclusion. The verdict is posted with
 * its digest and reasoning, and the transfer executes only after the window
 * closes without an appeal. That is what makes the system safe to be wrong
 * occasionally: being wrong costs a delay, not somebody's ten thousand dollars.
 *
 * In-memory on purpose - this is the mock. The state machine and the digest are
 * what a real deployment would keep; the storage is not.
 */

import type { ArbitrationResult, Party } from "./types";

export interface PartyRef {
  name: string;
  /** A proven wallet address, or null until one signs in. */
  address: string | null;
}
import type { IxsVaultSummary, UnsignedTx } from "./ixs";
import type { Role } from "./identity";
import { accrue } from "./yield";
import { formatMinor } from "./yield";

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

export interface Participant {
  role: Role;
  address: string;
  at: number;
}

export interface Funding {
  /** The escrow agent's address on the configured Base network. */
  agent: string;
  network: string;
  explorerUrl: string;
  /** The agent's USDC balance when the case opened. */
  usdc: string;
  faucetTx?: string;
  at: number;
}

export interface Vault {
  id: string;
  contractTitle: string;
  asset: string;
  /** The escrow for this case, in USDC. Real: it is what the agent will pay out. */
  amount: number;
  plaintiff: PartyRef;
  defendant: PartyRef;
  /** Wallets that have signed in to this case, by role. */
  participants: Participant[];
  /** Set once the escrow agent has confirmed it holds the amount. */
  funding?: Funding;
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
  /** Where the escrow sits while the dispute is open. Absent means cash. */
  allocation?: Allocation;
  /** Set on release: how principal, yield and fee were divided. */
  settlement?: Settlement;
  /** The human decision that closed an appeal. */
  review?: Review;
  /** True while a payout is in flight, so a second call cannot pay again. */
  settling?: boolean;
}

export interface Review {
  decision: "uphold" | "overturn";
  note: string;
  at: number;
  /** Who the escrow went to after review. */
  payee: PartyRef;
}

export interface Allocation {
  vaultId: string;
  name: string;
  symbol: string;
  chainName: string;
  contractAddress: string;
  explorerUrl: string;
  /** Annual rate as a fraction, as reported by IXS at allocation time. */
  rate: number;
  sharePrice?: number;
  /** When the escrow was placed. Yield accrues from here. */
  at: number;
  rationale: string;
  /** The subscription request a signer would send. Unsigned. */
  tx: UnsignedTx;
  source: "live" | "recorded";
}

export interface Settlement {
  days: number;
  /** All amounts in minor units of the escrow asset, as strings for JSON. */
  principal: string;
  /** Nothing was deposited, so nothing was earned. Kept explicit. */
  yieldEarned: string;
  /** What the escrow would have earned at the vault's live rate over `days`. A projection. */
  projectedYield: string;
  fee: string;
  payout: string;
  /** Display strings with two decimals. */
  display: { principal: string; yieldEarned: string; projectedYield: string; fee: string; payout: string };
  /** The redemption request a signer would send. Unsigned. */
  redeemTx?: UnsignedTx;
  /** The real payout transfer, once made. */
  payoutTx?: string;
  payoutUrl?: string;
  payee: PartyRef;
}

/** Judr's fee: a quarter of the yield the escrow earned, with a 20 USDC floor
 *  that applies only when yield covers it. Principal is never touched. */
export const FEE_BPS = 2500;
export const FEE_FLOOR_MINOR = 20_000_000n;
const ASSET_DECIMALS = 6;

/** The escrow per case. Small, because it is real testnet USDC from a faucet. */
export const ESCROW_AMOUNT = Number(process.env.JUDR_ESCROW_USDC ?? "0.1");

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
    amount: ESCROW_AMOUNT,
    plaintiff: { name: "A. Moreau (Contractor)", address: null },
    defendant: { name: "B. Adeyemi (Client)", address: null },
    participants: [],
    status: "funded",
    events: [{ at: Date.now(), label: "Case opened", detail: `Sample case · ${VAULT_ID} · ${ESCROW_AMOUNT.toFixed(2)} USDC escrow` }],
  };
}

/**
 * One case per browser session, not one global. A public demo is opened by
 * several judges at once, and with a single shared case the second visitor's
 * reset lands in the middle of the first visitor's run. Kept on globalThis so
 * it survives dev-server hot reloads, and capped so an anonymous caller cannot
 * grow it without bound.
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
    while (all.size > MAX_SESSIONS) {
      const oldest = all.keys().next().value;
      if (oldest === undefined) break;
      all.delete(oldest);
    }
  }
  return vault;
}

/** A fresh case for rendering only - never stored, never mutated. */
export function previewVault(): Vault {
  return freshVault();
}

export function resetVault(sessionId: string): Vault {
  const vault = freshVault();
  vaults().set(sessionId, vault);
  return vault;
}

/**
 * A case under appeal is closed to new arbitration. That is the whole point
 * of an appeal: nothing Judr does afterwards may move the funds until a human
 * has looked.
 */
export function raiseDispute(sessionId: string, reason: string): Vault {
  const vault = getVault(sessionId);
  if (vault.status === "released") throw new VaultError("Escrow already released.");
  if (vault.status === "appealed") {
    throw new VaultError("Case is under appeal; it is closed to further arbitration until a human reviews it.");
  }
  if (vault.status === "verdict_posted") {
    throw new VaultError("A verdict is already posted and its appeal window is open.");
  }
  vault.status = "disputed";
  vault.events.push({ at: Date.now(), label: "Dispute raised", detail: reason });
  return vault;
}

/** The escrow agent confirmed it holds the amount. Real balance, real hash. */
export function recordFunding(sessionId: string, funding: Funding): Vault {
  const vault = getVault(sessionId);
  vault.funding = funding;
  vault.events.push({
    at: funding.at,
    label: "Escrow funded",
    detail: `${vault.amount.toFixed(2)} USDC held by the escrow agent ${short(funding.agent)} on ${funding.network} · agent balance ${Number(funding.usdc).toFixed(2)} USDC${funding.faucetTx ? " · topped up from the Coinbase faucet" : ""}`,
  });
  return vault;
}

/**
 * A wallet signed in to the case. One address holds one role at a time; a
 * party's address is where its payout goes and where its appeal must come
 * from.
 */
export function joinAs(sessionId: string, role: Role, address: string, at = Date.now()): Vault {
  const vault = getVault(sessionId);
  const addr = address.toLowerCase();
  vault.participants = vault.participants.filter((p: Participant) => p.address.toLowerCase() !== addr);
  vault.participants.push({ role, address, at });
  for (const party of ["plaintiff", "defendant"] as const) {
    if (vault[party].address?.toLowerCase() === addr && role !== party) vault[party].address = null;
  }
  if (role === "plaintiff" || role === "defendant") vault[role].address = address;
  vault.events.push({
    at,
    label: `Wallet joined as ${role}`,
    detail: `${short(address)} proved control by signature`,
  });
  return vault;
}

export function roleOf(vault: Vault, address: string | undefined | null): Role | null {
  if (!address) return null;
  return vault.participants.find((p) => p.address.toLowerCase() === address.toLowerCase())?.role ?? null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Records where the escrow sits. Allowed while funded or disputed - the
 * agent may rebalance while a case is open - but not once a verdict is
 * posted, because the redemption clock is then already running.
 */
export function setAllocation(sessionId: string, allocation: Allocation): Vault {
  const vault = getVault(sessionId);
  if (vault.status !== "funded" && vault.status !== "disputed") {
    throw new VaultError(`Cannot move the escrow while the vault is ${vault.status.replace("_", " ")}.`);
  }
  vault.allocation = allocation;
  vault.events.push({
    at: allocation.at,
    label: "Escrow allocated",
    detail: `${allocation.name} (${allocation.symbol}) on ${allocation.chainName} · ${(allocation.rate * 100).toFixed(2)}% TTM · ${allocation.source === "live" ? "agent decision" : "recorded decision"}`,
  });
  return vault;
}

/**
 * The agent re-evaluated and chose to stay. The allocation date is kept -
 * yield has been accruing since the escrow was placed, and a fresh timestamp
 * would silently discard it - and the decision is written to the log.
 */
export function holdAllocation(sessionId: string, rationale: string, source: "live" | "recorded"): Vault {
  const vault = getVault(sessionId);
  if (!vault.allocation) throw new VaultError("Nothing is allocated to hold.");
  if (vault.status !== "funded" && vault.status !== "disputed") {
    throw new VaultError(`Cannot move the escrow while the vault is ${vault.status.replace("_", " ")}.`);
  }
  vault.allocation = { ...vault.allocation, rationale, source };
  vault.events.push({
    at: Date.now(),
    label: "Allocation re-evaluated: hold",
    detail: `${vault.allocation.symbol} on ${vault.allocation.chainName} kept · ${source === "live" ? "agent decision" : "recorded decision"}`,
  });
  return vault;
}

/** The policy refused the model's proposal. Nothing moves; the refusal is on the record. */
export function refuseAllocation(sessionId: string, reasons: string[]): Vault {
  const vault = getVault(sessionId);
  vault.events.push({
    at: Date.now(),
    label: "Allocation refused by policy",
    detail: reasons.join(" "),
  });
  return vault;
}

export function holdCash(sessionId: string, rationale: string): Vault {
  const vault = getVault(sessionId);
  if (vault.status !== "funded" && vault.status !== "disputed") {
    throw new VaultError(`Cannot move the escrow while the vault is ${vault.status.replace("_", " ")}.`);
  }
  vault.allocation = undefined;
  vault.events.push({ at: Date.now(), label: "Escrow held as cash", detail: rationale });
  return vault;
}

/**
 * How the escrow divides at settlement. Nothing was deposited into a vault, so
 * nothing was earned: the fee is zero and the payout is principal. The
 * projection shows what the allocation the agent chose would have earned at
 * the vault's live rate over the days the case was open.
 */
export function computeSettlement(vault: Vault, at: number, payee: PartyRef, redeemTx?: UnsignedTx): Settlement {
  const principal = BigInt(Math.round(vault.amount * 10 ** ASSET_DECIMALS));
  const opened = vault.funding?.at ?? vault.events[0]?.at ?? at;
  const days = Math.max(0, Math.floor((at - opened) / 86_400_000));
  const projected = vault.allocation ? accrue(principal, vault.allocation.rate, days) : 0n;
  const show = (n: bigint) => formatMinor(n, ASSET_DECIMALS);
  return {
    days,
    principal: principal.toString(),
    yieldEarned: "0",
    projectedYield: projected.toString(),
    fee: "0",
    payout: principal.toString(),
    display: {
      principal: show(principal),
      yieldEarned: show(0n),
      projectedYield: show(projected),
      fee: show(0n),
      payout: show(principal),
    },
    ...(redeemTx ? { redeemTx } : {}),
    payee,
  };
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
  const payee = vault[result.verdict.winner];
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

export function appeal(sessionId: string, reason: string, by?: string | null): Vault {
  const vault = getVault(sessionId);
  if (vault.status !== "verdict_posted" || !vault.verdict) {
    throw new VaultError("No verdict is currently open to appeal.");
  }
  if (Date.now() > vault.verdict.appealDeadline) {
    throw new VaultError("The appeal window has closed.");
  }
  const loser: Role = vault.verdict.winner === "plaintiff" ? "defendant" : "plaintiff";
  if (roleOf(vault, by) !== loser) {
    throw new VaultError(`Only the losing party can appeal. Connect a wallet and sign in as ${loser === "plaintiff" ? "the Contractor" : "the Client"}.`);
  }
  vault.status = "appealed";
  vault.events.push({
    at: Date.now(),
    label: "Appeal lodged",
    detail: `${reason} - release halted, escalated to human review`,
  });
  return vault;
}

/**
 * Human review closes an appeal. This is the only path out of "appealed", and
 * it is not Judr's: a person who has signed in as the reviewer upholds the
 * verdict or overturns it, with a note that goes on the record. The route
 * pays the resulting payee on-chain between prepare and complete.
 */
export function prepareReview(
  sessionId: string,
  decision: "uphold" | "overturn",
  note: string,
  by?: string | null,
): { payee: PartyRef; amount: number } {
  const vault = getVault(sessionId);
  if (vault.status !== "appealed" || !vault.verdict) throw new VaultError("Only an appealed verdict can be reviewed.");
  if (!note.trim()) throw new VaultError("A review needs a written reason.");
  if (roleOf(vault, by) !== "reviewer") throw new VaultError("Only a wallet signed in as the reviewer can decide an appeal.");
  if (vault.settling) throw new VaultError("A payout is already in flight for this case.");
  const upheld = decision === "uphold";
  const winner: Party = upheld ? vault.verdict.winner : vault.verdict.winner === "plaintiff" ? "defendant" : "plaintiff";
  const payee = vault[winner];
  if (!payee.address) throw new VaultError(`${payee.name} has not connected a wallet; the payout has nowhere to go.`);
  vault.settling = true;
  return { payee, amount: vault.amount };
}

export function completeReview(
  sessionId: string,
  decision: "uphold" | "overturn",
  note: string,
  paid: { txHash: string; explorerUrl: string },
  redeemTx?: UnsignedTx,
): Vault {
  const vault = getVault(sessionId);
  vault.settling = false;
  const { payee } = prepareReview(sessionId, decision, note, vault.participants.find((p: Participant) => p.role === "reviewer")?.address);
  vault.settling = false;
  const now = Date.now();
  vault.review = { decision, note: note.trim(), at: now, payee };
  vault.status = "released";
  vault.releasedTo = payee;
  vault.settlement = { ...computeSettlement(vault, now, payee, redeemTx), payoutTx: paid.txHash, payoutUrl: paid.explorerUrl };
  vault.events.push({
    at: now,
    label: decision === "uphold" ? "Human review: verdict upheld" : "Human review: verdict overturned",
    detail: `${vault.review.note} - ${vault.settlement.display.payout} ${vault.asset} paid to ${payee.name} (${short(payee.address ?? "")}) · tx ${paid.txHash.slice(0, 10)}…`,
  });
  return vault;
}

/**
 * Release, part one: may the escrow move, and to whom? Refuses early, refuses
 * under appeal, refuses if the winner has no proven address. Pure.
 */
export function prepareRelease(sessionId: string): { payee: PartyRef; amount: number } {
  const vault = getVault(sessionId);
  if (vault.status === "released") throw new VaultError("Already released.");
  if (vault.settling) throw new VaultError("A payout is already in flight for this case.");
  if (vault.status === "appealed") throw new VaultError("Verdict is under appeal; release is halted.");
  if (vault.status !== "verdict_posted" || !vault.verdict) throw new VaultError("No verdict has been posted for this vault.");
  if (Date.now() < vault.verdict.appealDeadline) throw new VaultError("Appeal window has not closed yet.");
  const payee = vault[vault.verdict.winner];
  if (!payee.address) {
    throw new VaultError(`${payee.name} has not connected a wallet; the payout has nowhere to go. Sign in as that party to receive it.`);
  }
  vault.settling = true;
  return { payee, amount: vault.amount };
}

/** The transfer failed or was refused: unlock the case so it can be tried again. */
export function abortSettlement(sessionId: string): void {
  getVault(sessionId).settling = false;
}

/** Release, part two: the transfer happened; record it. */
export function completeRelease(sessionId: string, paid: { txHash: string; explorerUrl: string }, redeemTx?: UnsignedTx): Vault {
  const vault = getVault(sessionId);
  vault.settling = false;
  const { payee } = prepareRelease(sessionId);
  vault.settling = false;
  const now = Date.now();
  vault.status = "released";
  vault.releasedTo = payee;
  vault.settlement = { ...computeSettlement(vault, now, payee, redeemTx), payoutTx: paid.txHash, payoutUrl: paid.explorerUrl };
  vault.events.push({
    at: now,
    label: "Escrow released",
    detail: `${vault.settlement.display.payout} ${vault.asset} paid to ${payee.name} (${short(payee.address ?? "")}) on-chain · tx ${paid.txHash.slice(0, 10)}…`,
  });
  return vault;
}

/** A thin summary of a vault for the allocation record. */
export function allocationFrom(
  vault: IxsVaultSummary,
  decision: { rationale: string },
  tx: UnsignedTx,
  source: "live" | "recorded",
  at = Date.now(),
): Allocation {
  return {
    vaultId: vault.id,
    name: vault.name,
    symbol: vault.symbol,
    chainName: vault.chainName,
    contractAddress: vault.contractAddress,
    explorerUrl: vault.explorerUrl,
    rate: vault.ttmRate,
    ...(vault.onchain ? { sharePrice: vault.onchain.sharePrice } : {}),
    at,
    rationale: decision.rationale,
    tx,
    source,
  };
}
