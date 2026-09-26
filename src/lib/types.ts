/**
 * Core domain types for Judr.
 *
 * Everything the reasoning graph produces is typed and schema-validated before
 * it is allowed to influence the next step. A verdict that cannot be validated
 * is not a verdict.
 */

export type Party = "plaintiff" | "defendant";

/** A single piece of evidence submitted by one of the parties. */
export interface EvidenceDoc {
  id: string;
  party: Party;
  filename: string;
  /** Plain-text content. PDFs/images are flattened to text before ingest. */
  text: string;
}

/** The escrow agreement under dispute. */
export interface DisputeContract {
  id: string;
  title: string;
  text: string;
}

/** Everything needed to arbitrate, assembled by the API route. */
export interface DisputeBundle {
  vaultId: string;
  contract: DisputeContract;
  /** Who raised the dispute, and what they say went wrong. */
  claim: string;
  plaintiff: PartyRef;
  defendant: PartyRef;
  evidence: EvidenceDoc[];
}

export interface PartyRef {
  name: string;
  address: string;
}

/* ---------------------------------------------------------------- */
/* Step outputs - one interface per node in the reasoning graph.     */
/* ---------------------------------------------------------------- */

export interface Clause {
  id: string;
  label: string;
  text: string;
  obligation_of: Party | "both";
}

export interface ClauseSet {
  clauses: Clause[];
}

export interface ClassifiedClaim {
  claim_type: string;
  summary: string;
  clauses_invoked: string[];
}

export type Finding = "satisfied" | "breached" | "indeterminate";

export interface ClauseFinding {
  clause_id: string;
  finding: Finding;
  /** Evidence ids that drove this finding. Verified to exist in step 5. */
  supporting_evidence: string[];
  plaintiff_position: string;
  defendant_position: string;
  rationale: string;
}

export interface Evaluation {
  findings: ClauseFinding[];
}

export interface Verdict {
  winner: Party;
  award_basis: string;
  decisive_clauses: string[];
  rationale: string;
}

export interface VerificationIssue {
  kind: "unknown_clause" | "unknown_evidence" | "unsupported_claim" | "no_decisive_clause";
  detail: string;
}

export interface Verification {
  passed: boolean;
  issues: VerificationIssue[];
}

/* ---------------------------------------------------------------- */
/* Guard                                                             */
/* ---------------------------------------------------------------- */

export type GuardSeverity = "low" | "medium" | "high";

export interface GuardFlag {
  evidence_id: string;
  kind: string;
  severity: GuardSeverity;
  excerpt: string;
  detail: string;
}

export interface GuardReport {
  clean: boolean;
  flags: GuardFlag[];
  /** Evidence ids that were quarantined and excluded from adjudication. */
  quarantined: string[];
  /**
   * Whether the model pass actually ran. "skipped" means no key; "failed"
   * means the call threw and only the deterministic patterns stand.
   */
  model_pass: "ran" | "skipped" | "failed";
  model_error?: string;
}

/* ---------------------------------------------------------------- */
/* The audit trail - the actual product                              */
/* ---------------------------------------------------------------- */

export interface StepRecord {
  step: string;
  label: string;
  startedAt: number;
  endedAt: number;
  /** Model that ran this step, or "deterministic" for non-model steps. */
  model: string;
  /** Token usage, when the provider reports it. */
  usage?: { prompt: number; completion: number; total: number };
  input_digest: string;
  output: unknown;
  /** Schema validation result. A step that fails this halts the graph. */
  validated: boolean;
  validation_errors?: string[];
  /** Number of repair attempts needed to get schema-valid output. */
  repairs: number;
}

export interface Confidence {
  /** 0..1, derived from step agreement - never self-reported by the model. */
  score: number;
  /**
   * How many independent adjudication runs agreed on the winner. A run that
   * errored is counted in `runs` and `failed` but never in `agreed`: an
   * unmeasured re-run is not evidence of stability.
   */
  consensus: { runs: number; agreed: number; failed: number; winners?: string[] };
  /** Share of decisive clauses with a non-indeterminate finding. */
  clause_support: number;
  verified: boolean;
}

export interface ArbitrationResult {
  disputeId: string;
  vaultId: string;
  verdict: Verdict;
  confidence: Confidence;
  guard: GuardReport;
  clauses: ClauseSet;
  claim: ClassifiedClaim;
  evaluation: Evaluation;
  verification: Verification;
  trail: StepRecord[];
  startedAt: number;
  endedAt: number;
  /** sha256 over the canonical verdict payload - what the vault signs on. */
  digest: string;
  /** What this decision cost, from the provider's reported usage. */
  cost: DecisionCost;
}

export interface DecisionCost {
  mode: "live" | "recorded";
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** USD at the model's published per-million rates. */
  usd: number;
  seconds: number;
}

/* ---------------------------------------------------------------- */
/* Streaming events                                                  */
/* ---------------------------------------------------------------- */

export type ArbitrationEvent =
  | { type: "run_started"; disputeId: string; vaultId: string; at: number }
  | { type: "step_started"; step: string; label: string; at: number }
  | { type: "step_delta"; step: string; text: string }
  | { type: "step_repair"; step: string; attempt: number; errors: string[] }
  | { type: "step_done"; step: string; record: StepRecord }
  | { type: "guard_flag"; flag: GuardFlag }
  | { type: "run_done"; result: ArbitrationResult }
  | { type: "run_failed"; step: string; error: string };
