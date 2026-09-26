/**
 * Graph orchestrator.
 *
 * Runs the steps in dependency order, records every one into an audit trail,
 * and derives confidence from the run itself. Emits events as it goes so the
 * dashboard can render the reasoning as it happens rather than after the fact.
 */

import { createHash } from "node:crypto";
import { estimateUsd, hasServKey, servConfig } from "../serv";
import { screenEvidence } from "../guard";
import { adjudicate, classifyClaim, evaluateEvidence, extractClauses } from "./steps";
import type {
  ArbitrationEvent,
  ArbitrationResult,
  ClassifiedClaim,
  ClauseSet,
  Confidence,
  DisputeBundle,
  Evaluation,
  StepRecord,
  Verdict,
  Verification,
  VerificationIssue,
} from "../types";

export type Emit = (event: ArbitrationEvent) => void;

const CONSENSUS_RUNS = Number(process.env.JUDR_CONSENSUS_RUNS ?? "3");

export interface RunOptions {
  bundle: DisputeBundle;
  emit: Emit;
  signal?: AbortSignal;
}

export async function runArbitration(opts: RunOptions): Promise<ArbitrationResult> {
  const { bundle, emit, signal } = opts;
  const disputeId = `judr-${bundle.vaultId}-${Date.now().toString(36)}`;
  const startedAt = Date.now();

  emit({ type: "run_started", disputeId, vaultId: bundle.vaultId, at: startedAt });

  if (!hasServKey()) {
    throw new Error("SERV_API_KEY is not set. Judr decides cases live on SERV and has no recorded fallback.");
  }

  const trail: StepRecord[] = [];

  /** Wraps a step: timing, streaming, schema result, audit record. */
  async function step<T>(
    name: string,
    label: string,
    input: unknown,
    fn: (args: {
      onDelta: (t: string) => void;
      onRepair: (attempt: number, errors: string[]) => void;
      signal?: AbortSignal;
    }) => Promise<{ value: T; model: string; usage?: { prompt: number; completion: number; total: number }; repairs: number }>,
  ): Promise<T> {
    const stepStart = Date.now();
    emit({ type: "step_started", step: name, label, at: stepStart });

    try {
      const result = await fn({
        onDelta: (text) => emit({ type: "step_delta", step: name, text }),
        onRepair: (attempt, errors) =>
          emit({ type: "step_repair", step: name, attempt, errors }),
        signal,
      });

      const record: StepRecord = {
        step: name,
        label,
        startedAt: stepStart,
        endedAt: Date.now(),
        model: result.model,
        usage: result.usage,
        input_digest: digest(input),
        output: result.value,
        validated: true,
        repairs: result.repairs,
      };
      trail.push(record);
      emit({ type: "step_done", step: name, record });
      return result.value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      trail.push({
        step: name,
        label,
        startedAt: stepStart,
        endedAt: Date.now(),
        model: servConfig().model,
        input_digest: digest(input),
        output: null,
        validated: false,
        validation_errors: [message],
        repairs: 0,
      });
      emit({ type: "run_failed", step: name, error: message });
      throw error;
    }
  }

  // Step 0 - screen the evidence before any of it reaches the reasoning steps.
  const guardStart = Date.now();
  emit({ type: "step_started", step: "screen", label: "Screening evidence", at: guardStart });
  const guard = await screenEvidence(bundle.evidence, {
    onFlag: (flag) => emit({ type: "guard_flag", flag }),
    signal,
  });
  const admissible = bundle.evidence.filter((d) => !guard.quarantined.includes(d.id));
  // The record says what actually ran. If the model pass threw, the step is
  // recorded as deterministic-only and unvalidated, not as a model check.
  const guardRecord: StepRecord = {
    step: "screen",
    label: "Screening evidence",
    startedAt: guardStart,
    endedAt: Date.now(),
    model:
      guard.model_pass === "ran"
        ? `${servConfig().model} + deterministic patterns`
        : "deterministic patterns only",
    input_digest: digest(bundle.evidence.map((d) => d.id)),
    output: guard,
    validated: guard.model_pass !== "failed",
    ...(guard.model_pass === "failed"
      ? { validation_errors: [`model screening pass failed: ${guard.model_error}`] }
      : {}),
    repairs: 0,
  };
  trail.push(guardRecord);
  emit({ type: "step_done", step: "screen", record: guardRecord });

  // Steps 1–3.
  const clauses = await step<ClauseSet>(
    "extract_clauses",
    "Extracting contract clauses",
    bundle.contract.text,
    (args) => extractClauses(bundle, args),
  );

  const claim = await step<ClassifiedClaim>(
    "classify_claim",
    "Identifying what is in dispute",
    { claim: bundle.claim, clauses: clauses.clauses.map((c) => c.id) },
    (args) => classifyClaim(bundle, clauses, args),
  );

  const evaluation = await step<Evaluation>(
    "evaluate",
    "Weighing evidence against each clause",
    { clauses: claim.clauses_invoked, evidence: admissible.map((d) => d.id) },
    (args) => evaluateEvidence(bundle, clauses, claim, admissible, args),
  );

  // Step 4 - adjudicate. The first run is the verdict of record; the extra runs
  // exist to measure whether the decision is stable, which is what makes the
  // confidence number mean something.
  const verdict = await step<Verdict>(
    "adjudicate",
    "Adjudicating",
    evaluation,
    (args) => adjudicate(bundle, clauses, claim, evaluation, { ...args, temperature: 0 }),
  );

  const consensus = await measureConsensus({
    bundle,
    clauses,
    claim,
    evaluation,
    verdict,
    trail,
    emit,
    signal,
  });

  // Step 5 - verification. Deterministic on purpose: a model asked to check its
  // own citations will agree with itself. This one actually resolves the ids.
  const verifyStart = Date.now();
  emit({ type: "step_started", step: "verify", label: "Verifying citations", at: verifyStart });
  const verification = verify(verdict, clauses, evaluation, admissible.map((d) => d.id));
  const verifyRecord: StepRecord = {
    step: "verify",
    label: "Verifying citations",
    startedAt: verifyStart,
    endedAt: Date.now(),
    model: "deterministic",
    input_digest: digest(verdict),
    output: verification,
    validated: true,
    repairs: 0,
  };
  trail.push(verifyRecord);
  emit({ type: "step_done", step: "verify", record: verifyRecord });

  const confidence = deriveConfidence(verdict, evaluation, verification, consensus);

  const endedAt = Date.now();
  const promptTokens = trail.reduce((n, r) => n + (r.usage?.prompt ?? 0), 0);
  const completionTokens = trail.reduce((n, r) => n + (r.usage?.completion ?? 0), 0);
  const result: ArbitrationResult = {
    disputeId,
    vaultId: bundle.vaultId,
    verdict,
    confidence,
    guard,
    clauses,
    claim,
    evaluation,
    verification,
    trail,
    startedAt,
    endedAt,
    digest: verdictDigest(bundle, verdict),
    cost: {
      mode: "live",
      model: servConfig().model,
      promptTokens,
      completionTokens,
      usd: estimateUsd(promptTokens, completionTokens),
      seconds: Number(((endedAt - startedAt) / 1000).toFixed(1)),
    },
  };

  emit({ type: "run_done", result });
  return result;
}

/* ---------------------------------------------------------------- */
/* Consensus                                                         */
/* ---------------------------------------------------------------- */

async function measureConsensus(args: {
  bundle: DisputeBundle;
  clauses: ClauseSet;
  claim: ClassifiedClaim;
  evaluation: Evaluation;
  verdict: Verdict;
  trail: StepRecord[];
  emit: Emit;
  signal?: AbortSignal;
}): Promise<{ runs: number; agreed: number; failed: number; winners: string[] }> {
  const extra = Math.max(0, CONSENSUS_RUNS - 1);
  if (extra === 0) return { runs: 1, agreed: 1, failed: 0, winners: [args.verdict.winner] };

  const start = Date.now();
  args.emit({
    type: "step_started",
    step: "consensus",
    label: `Re-running the decision ${extra}× to test stability`,
    at: start,
  });

  const results = await Promise.allSettled(
    Array.from({ length: extra }, () =>
      adjudicate(args.bundle, args.clauses, args.claim, args.evaluation, {
        temperature: 0.7,
        signal: args.signal,
      }),
    ),
  );

  const rerunWinners = results.map((r) => (r.status === "fulfilled" ? r.value.value.winner : null));
  const tally = {
    ...tallyConsensus(rerunWinners, args.verdict.winner),
    winners: [args.verdict.winner, ...rerunWinners.map((w) => w ?? "failed")],
  };
  // The extra runs also carry usage; fold it into the record so the cost is complete.
  const usage = results.reduce(
    (acc, r) => {
      if (r.status !== "fulfilled" || !r.value.usage) return acc;
      return { prompt: acc.prompt + r.value.usage.prompt, completion: acc.completion + r.value.usage.completion, total: acc.total + r.value.usage.total };
    },
    { prompt: 0, completion: 0, total: 0 },
  );
  const failures = results.flatMap((r) =>
    r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [],
  );

  const record: StepRecord = {
    step: "consensus",
    label: `Re-running the decision ${extra}× to test stability`,
    startedAt: start,
    endedAt: Date.now(),
    model: servConfig().model,
    ...(usage.total > 0 ? { usage } : {}),
    input_digest: digest(args.evaluation),
    output: { ...tally, winner: args.verdict.winner },
    validated: tally.failed === 0,
    ...(tally.failed > 0 ? { validation_errors: failures } : {}),
    repairs: 0,
  };
  args.trail.push(record);
  args.emit({ type: "step_done", step: "consensus", record });

  return tally;
}

/**
 * Counts the re-runs. The verdict of record is run one and agrees with itself
 * by definition. A re-run that errored is a run that happened and did not
 * agree - it is never dropped, because dropping it would let a total failure
 * of the stability check score exactly like a perfect one.
 */
export function tallyConsensus(
  rerunWinners: Array<string | null>,
  winner: string,
): { runs: number; agreed: number; failed: number } {
  let agreed = 1;
  let failed = 0;
  for (const w of rerunWinners) {
    if (w === null) failed++;
    else if (w === winner) agreed++;
  }
  return { runs: 1 + rerunWinners.length, agreed, failed };
}

/* ---------------------------------------------------------------- */
/* Verification and confidence                                       */
/* ---------------------------------------------------------------- */

export function verify(
  verdict: Verdict,
  clauses: ClauseSet,
  evaluation: Evaluation,
  evidenceIds: string[],
): Verification {
  const issues: VerificationIssue[] = [];
  const clauseIds = new Set(clauses.clauses.map((c) => c.id));
  const evidence = new Set(evidenceIds);

  if (verdict.decisive_clauses.length === 0) {
    issues.push({
      kind: "no_decisive_clause",
      detail: "The verdict does not rest on any clause.",
    });
  }

  for (const id of verdict.decisive_clauses) {
    if (!clauseIds.has(id)) {
      issues.push({
        kind: "unknown_clause",
        detail: `Verdict cites clause "${id}", which does not exist in the contract.`,
      });
    }
  }

  const findingsByClause = new Map(evaluation.findings.map((f) => [f.clause_id, f]));

  for (const finding of evaluation.findings) {
    if (!clauseIds.has(finding.clause_id)) {
      issues.push({
        kind: "unknown_clause",
        detail: `Finding references clause "${finding.clause_id}", which does not exist.`,
      });
    }
    for (const id of finding.supporting_evidence) {
      if (!evidence.has(id)) {
        issues.push({
          kind: "unknown_evidence",
          detail: `Finding on "${finding.clause_id}" cites evidence "${id}", which was not submitted or was quarantined.`,
        });
      }
    }
  }

  for (const id of verdict.decisive_clauses) {
    const finding = findingsByClause.get(id);
    if (!finding) {
      issues.push({
        kind: "unsupported_claim",
        detail: `Clause "${id}" is decisive but was never evaluated.`,
      });
    } else if (finding.finding === "indeterminate") {
      issues.push({
        kind: "unsupported_claim",
        detail: `Clause "${id}" is decisive but its finding is indeterminate.`,
      });
    }
  }

  return { passed: issues.length === 0, issues };
}

export function deriveConfidence(
  verdict: Verdict,
  evaluation: Evaluation,
  verification: Verification,
  consensus: { runs: number; agreed: number; failed: number; winners?: string[] },
): Confidence {
  const findings = new Map(evaluation.findings.map((f) => [f.clause_id, f]));
  const decisive = verdict.decisive_clauses;

  const supported = decisive.filter((id) => {
    const f = findings.get(id);
    return f !== undefined && f.finding !== "indeterminate";
  }).length;

  const clauseSupport = decisive.length === 0 ? 0 : supported / decisive.length;
  const agreement = consensus.runs === 0 ? 0 : consensus.agreed / consensus.runs;

  // Weighted toward agreement: a decision that changes when you run it again is
  // not one anybody should act on, however well cited it is.
  let score = 0.6 * agreement + 0.4 * clauseSupport;

  // Failed verification caps confidence hard. An unverifiable verdict is not a
  // high-confidence verdict no matter how consistently the model reaches it.
  if (!verification.passed) score = Math.min(score, 0.35);

  return {
    score: Number(score.toFixed(3)),
    consensus,
    clause_support: Number(clauseSupport.toFixed(3)),
    verified: verification.passed,
  };
}

/* ---------------------------------------------------------------- */

export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex").slice(0, 16);
}

/** The payload a vault would sign over: identity of the decision, nothing else. */
export function verdictDigest(bundle: DisputeBundle, verdict: Verdict): string {
  return createHash("sha256")
    .update(
      canonical({
        vault: bundle.vaultId,
        contract: bundle.contract.id,
        winner: verdict.winner,
        payee:
          verdict.winner === "plaintiff" ? bundle.plaintiff.address : bundle.defendant.address,
        decisive_clauses: [...verdict.decisive_clauses].sort(),
      }),
    )
    .digest("hex");
}

/** Stable key ordering so the same decision always hashes the same way. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
