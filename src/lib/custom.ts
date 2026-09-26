/**
 * Bring your own dispute.
 *
 * A visitor can paste a contract, a claim and evidence and have Judr decide
 * it live. Custom input goes to the owner's SERV key, so it is bounded three
 * ways: sizes are capped, it needs a live key (the recorded run cannot decide
 * a dispute it has never seen), and each session gets a few runs an hour.
 * Everything else — screening, the graph, verification, settlement — is the
 * same path the demo takes.
 */

import type { DisputeBundle, EvidenceDoc, Party } from "./types";

export const LIMITS = {
  contractChars: 12_000,
  claimChars: 2_000,
  docChars: 6_000,
  docs: 8,
  totalChars: 40_000,
  nameChars: 80,
  runsPerHour: 3,
};

export interface CustomDisputeInput {
  title?: string;
  contract: string;
  claim: string;
  plaintiff: string;
  defendant: string;
  evidence: Array<{ filename?: string; party: Party; text: string }>;
}

export type CustomResult = { ok: true; bundle: DisputeBundle } | { ok: false; error: string };

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

export function toBundle(input: CustomDisputeInput, vaultId: string): CustomResult {
  const contract = clean(input.contract, LIMITS.contractChars + 1);
  const claim = clean(input.claim, LIMITS.claimChars + 1);
  const plaintiff = clean(input.plaintiff, LIMITS.nameChars) || "Plaintiff";
  const defendant = clean(input.defendant, LIMITS.nameChars) || "Defendant";
  const title = clean(input.title, 120) || "Custom dispute";

  if (contract.length < 40) return { ok: false, error: "The contract is too short to arbitrate — paste the operative terms." };
  if (contract.length > LIMITS.contractChars) return { ok: false, error: `The contract is over ${LIMITS.contractChars.toLocaleString()} characters.` };
  if (claim.length < 20) return { ok: false, error: "Say what is in dispute, in a sentence or two." };
  if (claim.length > LIMITS.claimChars) return { ok: false, error: `The claim is over ${LIMITS.claimChars.toLocaleString()} characters.` };

  const docs = Array.isArray(input.evidence) ? input.evidence : [];
  if (docs.length === 0) return { ok: false, error: "Add at least one evidence document." };
  if (docs.length > LIMITS.docs) return { ok: false, error: `At most ${LIMITS.docs} evidence documents.` };

  const evidence: EvidenceDoc[] = [];
  let total = contract.length + claim.length;
  docs.forEach((d, i) => {
    const text = clean(d.text, LIMITS.docChars + 1);
    if (text.length > LIMITS.docChars) throw new RangeError(`Document ${i + 1} is over ${LIMITS.docChars.toLocaleString()} characters.`);
    if (text.length < 10) return;
    const party: Party = d.party === "defendant" ? "defendant" : "plaintiff";
    evidence.push({
      id: `e${evidence.length + 1}`,
      party,
      filename: clean(d.filename, 80) || `document-${evidence.length + 1}.txt`,
      text,
    });
    total += text.length;
  });
  if (evidence.length === 0) return { ok: false, error: "Every evidence document was empty." };
  if (total > LIMITS.totalChars) return { ok: false, error: `The dispute is over ${LIMITS.totalChars.toLocaleString()} characters in total.` };

  return {
    ok: true,
    bundle: {
      vaultId,
      contract: { id: `custom-${Date.now().toString(36)}`, title, text: contract },
      claim,
      plaintiff: { name: plaintiff, address: "0xPLAINTIFF" },
      defendant: { name: defendant, address: "0xDEFENDANT" },
      evidence,
    },
  };
}

/* ---------------------------------------------------------------- */
/* Rate limits — in memory, sliding windows                          */
/*                                                                   */
/* Every arbitration spends the owner's SERV credit, so runs are     */
/* capped per session per hour and across all sessions per day, in   */
/* addition to the tighter cap on custom cases.                       */
/* ---------------------------------------------------------------- */

export const RUN_CAPS = {
  perSessionPerHour: Number(process.env.JUDR_RUNS_PER_SESSION_PER_HOUR ?? "6"),
  perDay: Number(process.env.JUDR_RUNS_PER_DAY ?? "150"),
};

const runs = globalThis as unknown as { __judrRuns?: Array<{ session: string; at: number }> };

export function allowRun(sessionId: string, now = Date.now()): { allowed: boolean; reason?: string } {
  if (!runs.__judrRuns) runs.__judrRuns = [];
  runs.__judrRuns = runs.__judrRuns.filter((r) => now - r.at < 86_400_000);
  const today = runs.__judrRuns.length;
  if (today >= RUN_CAPS.perDay) return { allowed: false, reason: `Judr has decided ${today} cases today, its daily ceiling. Try again tomorrow.` };
  const mine = runs.__judrRuns.filter((r) => r.session === sessionId && now - r.at < 3_600_000).length;
  if (mine >= RUN_CAPS.perSessionPerHour) return { allowed: false, reason: `This session has run ${mine} arbitrations in the last hour, its ceiling. Try again later.` };
  runs.__judrRuns.push({ session: sessionId, at: now });
  return { allowed: true };
}

const store = globalThis as unknown as { __judrCustomRuns?: Map<string, number[]> };

export function allowCustomRun(sessionId: string, now = Date.now()): { allowed: boolean; retryInMinutes?: number } {
  if (!store.__judrCustomRuns) store.__judrCustomRuns = new Map();
  const runs = (store.__judrCustomRuns.get(sessionId) ?? []).filter((t) => now - t < 3_600_000);
  if (runs.length >= LIMITS.runsPerHour) {
    return { allowed: false, retryInMinutes: Math.ceil((runs[0] + 3_600_000 - now) / 60_000) };
  }
  runs.push(now);
  store.__judrCustomRuns.set(sessionId, runs);
  return { allowed: true };
}
