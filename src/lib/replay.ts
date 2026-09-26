/**
 * Recorded run.
 *
 * Two jobs. It makes the demo work without a SERV key, and it makes the demo
 * work when the venue wifi does not. The recorded outputs go through exactly
 * the same verification and confidence derivation as a live run — replay
 * substitutes for the model calls, not for the logic being demonstrated.
 *
 * Replay is always labelled as such in the UI. A recorded run presented as a
 * live one would be the one genuinely dishonest thing this project could do.
 */

import { screenHeuristic } from "./guard";
import {
  CLAIM_SCHEMA,
  CLAUSE_SET_SCHEMA,
  EVALUATION_SCHEMA,
  VERDICT_SCHEMA,
  validate,
  type JsonSchema,
} from "./graph/schema";
import type {
  ArbitrationEvent,
  ArbitrationResult,
  ClassifiedClaim,
  ClauseSet,
  DisputeBundle,
  Evaluation,
  GuardReport,
  StepRecord,
  Verdict,
} from "./types";

// Not a model id: nothing is called during replay. The outputs were authored
// as fixtures and are validated against the same schemas a live run must pass.
const REPLAY_MODEL = "recorded fixture — no model call";

const CLAUSES: ClauseSet = {
  clauses: [
    {
      id: "c1",
      label: "Scope of work",
      text: "The Contractor shall deliver a five-page responsive marketing website comprising Home, Product, Pricing, About and Contact pages, built to the wireframes attached as Schedule A.",
      obligation_of: "plaintiff",
    },
    {
      id: "c2",
      label: "Delivery date",
      text: "The Contractor shall deliver on or before 10 September 2026.",
      obligation_of: "plaintiff",
    },
    {
      id: "c3",
      label: "Method of delivery and production exclusion",
      text: "Delivery is effected by (a) tagging the agreed release in the project Git repository, and (b) providing the Client with a working staging URL by email. Deployment to the Client's production domain is expressly outside the scope of this Agreement and is the Client's responsibility.",
      obligation_of: "both",
    },
    {
      id: "c4",
      label: "Acceptance window",
      text: "The Client shall have five (5) business days from delivery to notify the Contractor in writing of any defect. Absent written notice of defect within that period, the deliverable is deemed accepted.",
      obligation_of: "defendant",
    },
    {
      id: "c5",
      label: "Revisions",
      text: "Two rounds of revisions are included, provided they are requested within the acceptance period defined in clause 4.",
      obligation_of: "both",
    },
    {
      id: "c6",
      label: "Payment on acceptance",
      text: "The escrowed sum shall be released to the Contractor upon acceptance, whether express or deemed under clause 4.",
      obligation_of: "defendant",
    },
    {
      id: "c7",
      label: "Determination of disputes",
      text: "Any dispute as to whether delivery or acceptance occurred shall be determined by reference to the written record of the parties.",
      obligation_of: "both",
    },
  ],
};

const CLAIM: ClassifiedClaim = {
  claim_type: "non-delivery / deemed acceptance",
  summary:
    "The parties disagree whether the deliverable was delivered in the manner the contract requires, and whether the escrow became payable by deemed acceptance.",
  clauses_invoked: ["c2", "c3", "c4", "c6"],
};

const EVALUATION: Evaluation = {
  findings: [
    {
      clause_id: "c2",
      finding: "satisfied",
      supporting_evidence: ["e1", "e2"],
      plaintiff_position:
        "The release was tagged v1.0-delivery on 8 September 2026 at 14:22, two days before the contractual deadline.",
      defendant_position:
        "The Client does not dispute the tag date; the Client's position is that nothing appeared on the production domain.",
      rationale:
        "The repository log and the tagger date both show 8 September 2026, before the 10 September deadline. The Client contests the sufficiency of delivery, not its timing.",
    },
    {
      clause_id: "c3",
      finding: "satisfied",
      supporting_evidence: ["e1", "e2", "e3", "e5", "e6"],
      plaintiff_position:
        "Both limbs of clause 3 were performed: the release was tagged, and a working staging URL was sent by email on 8 September at 14:31.",
      defendant_position:
        "The Client checked adeyemi-consulting.example and found a 404, and states the site was never delivered.",
      rationale:
        "Clause 3 defines delivery as the Git tag plus a staging URL sent by email, and expressly excludes deployment to the Client's production domain. The uptime report shows the staging URL serving all five Schedule A routes with 99.97% availability across the relevant period, including a 39-minute five-page session on 8 September — consistent with the Client having opened it. The 404 the Client submits is for the production domain, which clause 3 places outside scope. The Client's own notes accept that clause 3 was not read closely before signing.",
    },
    {
      clause_id: "c4",
      finding: "breached",
      supporting_evidence: ["e2", "e4"],
      plaintiff_position:
        "No written notice of defect was received within five business days of delivery, so the deliverable is deemed accepted.",
      defendant_position:
        "The Client wrote on 16 September 2026 stating the site had never been delivered.",
      rationale:
        "Delivery was effected Tuesday 8 September 2026. Five business days from delivery are 9, 10, 11, 14 and 15 September, the window therefore closing at the end of Tuesday 15 September. The Client's notice is dated Wednesday 16 September at 17:48 — outside the window by one day. The clause 4 condition for deemed acceptance is met.",
    },
    {
      clause_id: "c6",
      finding: "satisfied",
      supporting_evidence: ["e2", "e4"],
      plaintiff_position:
        "Acceptance having occurred by operation of clause 4, the escrow is payable to the Contractor.",
      defendant_position:
        "The Client declines to release the escrow for work it says it cannot see.",
      rationale:
        "Clause 6 makes release conditional on acceptance, express or deemed. Deemed acceptance arose under clause 4 on 15 September 2026, so the release condition is satisfied.",
    },
  ],
};

const VERDICT: Verdict = {
  winner: "plaintiff",
  award_basis:
    "The deliverable was accepted by operation of the acceptance window, and payment on acceptance is a condition the contract makes automatic.",
  decisive_clauses: ["c3", "c4"],
  rationale:
    "The Client's case rests on the site not appearing at adeyemi-consulting.example, and on that narrow point the Client is factually correct — the 404 is genuine. But Method of delivery and production exclusion defines delivery as a Git tag plus a staging URL sent by email, and expressly makes deployment to the production domain the Client's own responsibility. Both limbs were performed on 8 September, and the staging site served all five contracted pages throughout the period. The Client was therefore looking at the wrong address; the contract never promised anything at that domain.\n\nThat leaves the Acceptance window. Delivery was effected on Tuesday 8 September. The five business days available to the Client expired at the end of Tuesday 15 September. The Client's notice came on Wednesday 16 September, one day late, and the deliverable was accepted by operation of the clause before that notice was written.\n\nThe Client's strongest point is that commissioning a website in order to have it live on your own domain is an entirely reasonable expectation, and the Client's notes are candid that clause 3 was not read closely. That expectation is understandable but it is not what the Agreement provides, and a one-day overrun of a five-day window is short but it is still outside it. Payment on acceptance makes release automatic once acceptance occurs.\n\nThe escrow is payable to the Contractor.",
};

/**
 * The recorded run, exposed so the landing page's specimens are drawn from the
 * same source as the demo itself. If the recorded verdict changes, the
 * marketing page changes with it — there is no second copy to fall out of date.
 */
export const RECORDED = {
  clauses: CLAUSES,
  claim: CLAIM,
  evaluation: EVALUATION,
  verdict: VERDICT,
} as const;

interface ReplayArgs {
  disputeId: string;
  bundle: DisputeBundle;
  emit: (event: ArbitrationEvent) => void;
  startedAt: number;
  signal?: AbortSignal;
}

/** Paced so the feed reads at roughly the speed of a live run. */
const PACE = Number(process.env.JUDR_REPLAY_PACE ?? "1");

export async function loadReplay(args: ReplayArgs): Promise<ArbitrationResult> {
  const { bundle, emit, signal } = args;
  const trail: StepRecord[] = [];

  // Screening runs for real even in replay — it is deterministic, so the
  // injection demo is genuinely live regardless of whether a key is present.
  const guardStart = Date.now();
  emit({ type: "step_started", step: "screen", label: "Screening evidence", at: guardStart });
  await pause(500, signal);

  const flags = screenHeuristic(bundle.evidence);
  for (const flag of flags) {
    emit({ type: "guard_flag", flag });
    await pause(220, signal);
  }
  const quarantined = [
    ...new Set(flags.filter((f) => f.severity === "high").map((f) => f.evidence_id)),
  ];
  const guard: GuardReport = { clean: flags.length === 0, flags, quarantined, model_pass: "skipped" };
  trail.push(
    record("screen", "Screening evidence", guardStart, "deterministic", guard),
  );
  emit({ type: "step_done", step: "screen", record: trail[trail.length - 1] });

  const admissible = bundle.evidence.filter((d) => !quarantined.includes(d.id));
  const admissibleIds = new Set(admissible.map((d) => d.id));

  // Quarantined documents must not appear in the recorded findings either, or
  // replay would demonstrate the opposite of what the guard is for.
  const evaluation: Evaluation = {
    findings: EVALUATION.findings.map((f) => ({
      ...f,
      supporting_evidence: f.supporting_evidence.filter((id) => admissibleIds.has(id)),
    })),
  };

  await playStep(args, trail, "extract_clauses", "Extracting contract clauses", CLAUSES, CLAUSE_SET_SCHEMA, [
    "Reading the Agreement and isolating each operative term…",
    "Seven clauses identified. Quoting verbatim; no clause is paraphrased.",
    "Noting that clause 3 contains an express scope exclusion and clause 4 a conditional acceptance term — both procedural, both capable of disposing of a dispute on their own.",
  ]);

  await playStep(args, trail, "classify_claim", "Identifying what is in dispute", CLAIM, CLAIM_SCHEMA, [
    "The parties frame this as 'was the site delivered'.",
    "That framing is incomplete. Delivery is a defined term here, and acceptance operates automatically on a deadline.",
    "Invoking c2 (delivery date), c3 (method and exclusion), c4 (acceptance window), c6 (payment on acceptance).",
  ]);

  await playStep(args, trail, "evaluate", "Weighing evidence against each clause", evaluation, EVALUATION_SCHEMA, [
    "c2 — repository log gives the tag at 2026-09-08 14:22, ahead of the 10 September deadline. Satisfied.",
    "c3 — clause defines delivery as tag plus emailed staging URL, and expressly excludes the production domain.",
    "c3 — uptime report shows all five Schedule A routes serving 200 across the period; the submitted 404 is for the production domain, outside scope. Satisfied.",
    "c4 — delivery Tuesday 8 September. Five business days: 9, 10, 11, 14, 15 September. Window closes end of Tuesday 15 September.",
    "c4 — the defect notice is timestamped Wednesday 16 September 17:48. One day outside the window. Deemed acceptance arose before it was sent. Breached.",
    "c6 — release is conditional on acceptance, express or deemed. Condition met. Satisfied.",
  ]);

  await playStep(args, trail, "adjudicate", "Adjudicating", VERDICT, VERDICT_SCHEMA, [
    "The Client is factually right that the production domain returned 404 — and that fact is not load-bearing, because clause 3 never promised anything there.",
    "Decisive: c3 fixes what delivery meant; c4 disposes of the matter on timing.",
    "Addressing the Client's strongest point: the expectation of a live site on their own domain is reasonable, and it is not what the Agreement provides.",
    "Verdict: the escrow is payable to the Contractor.",
  ]);

  // The recorded run does not re-decide anything. The label says so, rather
  // than implying a stability measurement is happening in front of the viewer.
  const consensusLabel = "Decision stability (recorded result — not re-measured)";
  const consensusStart = Date.now();
  emit({ type: "step_started", step: "consensus", label: consensusLabel, at: consensusStart });
  await pause(900, signal);
  const consensus = { runs: 3, agreed: 3, failed: 0, winners: ["plaintiff", "plaintiff", "plaintiff"] };
  trail.push(
    record("consensus", consensusLabel, consensusStart, REPLAY_MODEL, {
      ...consensus,
      winner: VERDICT.winner,
    }),
  );
  emit({ type: "step_done", step: "consensus", record: trail[trail.length - 1] });

  const { verify, deriveConfidence, verdictDigest } = await import("./graph/run");

  const verifyStart = Date.now();
  emit({ type: "step_started", step: "verify", label: "Verifying citations", at: verifyStart });
  await pause(450, signal);
  const verification = verify(VERDICT, CLAUSES, evaluation, [...admissibleIds]);
  trail.push(record("verify", "Verifying citations", verifyStart, "deterministic", verification));
  emit({ type: "step_done", step: "verify", record: trail[trail.length - 1] });

  return {
    disputeId: args.disputeId,
    vaultId: bundle.vaultId,
    verdict: VERDICT,
    confidence: deriveConfidence(VERDICT, evaluation, verification, consensus),
    guard,
    clauses: CLAUSES,
    claim: CLAIM,
    evaluation,
    verification,
    trail,
    startedAt: args.startedAt,
    endedAt: Date.now(),
    digest: verdictDigest(bundle, VERDICT),
    cost: {
      mode: "recorded",
      model: REPLAY_MODEL,
      promptTokens: 0,
      completionTokens: 0,
      usd: 0,
      seconds: Number(((Date.now() - args.startedAt) / 1000).toFixed(1)),
    },
  };
}

async function playStep(
  args: ReplayArgs,
  trail: StepRecord[],
  step: string,
  label: string,
  output: unknown,
  schema: JsonSchema,
  narration: string[],
): Promise<void> {
  const start = Date.now();
  args.emit({ type: "step_started", step, label, at: start });

  for (const line of narration) {
    await typeOut(args, step, `${line}\n`);
    await pause(260, args.signal);
  }

  // The fixture is checked against the same schema a live step must satisfy.
  // "schema ✓" in the trail means the same thing in both modes.
  const errors = validate(output, schema);
  const rec = record(step, label, start, REPLAY_MODEL, output);
  rec.validated = errors.length === 0;
  if (errors.length > 0) rec.validation_errors = errors;
  trail.push(rec);
  args.emit({ type: "step_done", step, record: rec });
}

/** Emits a line in word-sized chunks so the feed animates like a live stream. */
async function typeOut(args: ReplayArgs, step: string, text: string): Promise<void> {
  const words = text.split(/(\s+)/);
  let buffer = "";
  for (const word of words) {
    buffer += word;
    if (buffer.length >= 12) {
      args.emit({ type: "step_delta", step, text: buffer });
      buffer = "";
      await pause(28, args.signal);
    }
  }
  if (buffer) args.emit({ type: "step_delta", step, text: buffer });
}

function record(
  step: string,
  label: string,
  startedAt: number,
  model: string,
  output: unknown,
): StepRecord {
  return {
    step,
    label,
    startedAt,
    endedAt: Date.now(),
    model,
    input_digest: "replay",
    output,
    validated: true,
    repairs: 0,
  };
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  const scaled = ms * PACE;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(resolve, scaled);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}
