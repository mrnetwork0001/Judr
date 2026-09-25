/**
 * The claims Judr makes about itself are testable, so they are tested here:
 * schema enforcement, citation verification, confidence derivation, evidence
 * screening, and digest stability.
 *
 *   node --test src/lib/__tests__/
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { validate, VERDICT_SCHEMA, CLAUSE_SET_SCHEMA } from "../graph/schema";
import { verify, deriveConfidence, verdictDigest, tallyConsensus } from "../graph/run";
import { screenHeuristic } from "../guard";
import { DEMO_DISPUTE, POISONED_EVIDENCE, demoDispute } from "../fixtures";
import type { ClauseSet, Evaluation, Verdict } from "../types";

/* ---------------------------------------------------------------- */
/* Schema validation                                                 */
/* ---------------------------------------------------------------- */

test("validate accepts a well-formed verdict", () => {
  const verdict: Verdict = {
    winner: "plaintiff",
    award_basis: "basis",
    decisive_clauses: ["c1"],
    rationale: "because",
  };
  assert.deepEqual(validate(verdict, VERDICT_SCHEMA), []);
});

test("validate rejects an out-of-enum winner", () => {
  const errors = validate(
    { winner: "the vibes", award_basis: "x", decisive_clauses: [], rationale: "y" },
    VERDICT_SCHEMA,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected one of plaintiff \| defendant/);
});

test("validate reports every problem at once, for the repair prompt", () => {
  const errors = validate({ winner: "plaintiff" }, VERDICT_SCHEMA);
  assert.equal(errors.length, 3);
  assert.ok(errors.every((e) => /required field missing/.test(e)));
});

test("validate rejects unexpected fields and wrong element types", () => {
  const errors = validate(
    {
      winner: "plaintiff",
      award_basis: "x",
      decisive_clauses: ["c1", 7],
      rationale: "y",
      confidence: 0.99,
    },
    VERDICT_SCHEMA,
  );
  assert.ok(errors.some((e) => /\$\.confidence: unexpected field/.test(e)));
  assert.ok(errors.some((e) => /decisive_clauses\[1\]: expected string/.test(e)));
});

test("validate walks nested arrays of objects", () => {
  const errors = validate(
    { clauses: [{ id: "c1", label: "L", text: "T", obligation_of: "nobody" }] },
    CLAUSE_SET_SCHEMA,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /clauses\[0\]\.obligation_of/);
});

/* ---------------------------------------------------------------- */
/* Verification                                                      */
/* ---------------------------------------------------------------- */

const CLAUSES: ClauseSet = {
  clauses: [
    { id: "c1", label: "Delivery", text: "t", obligation_of: "plaintiff" },
    { id: "c2", label: "Acceptance", text: "t", obligation_of: "defendant" },
  ],
};

const EVALUATION: Evaluation = {
  findings: [
    {
      clause_id: "c1",
      finding: "satisfied",
      supporting_evidence: ["e1"],
      plaintiff_position: "p",
      defendant_position: "d",
      rationale: "r",
    },
    {
      clause_id: "c2",
      finding: "breached",
      supporting_evidence: ["e2"],
      plaintiff_position: "p",
      defendant_position: "d",
      rationale: "r",
    },
  ],
};

const GOOD_VERDICT: Verdict = {
  winner: "plaintiff",
  award_basis: "b",
  decisive_clauses: ["c1", "c2"],
  rationale: "r",
};

test("verify passes when every citation resolves", () => {
  const result = verify(GOOD_VERDICT, CLAUSES, EVALUATION, ["e1", "e2"]);
  assert.equal(result.passed, true);
  assert.deepEqual(result.issues, []);
});

test("verify catches a verdict citing a clause that does not exist", () => {
  const result = verify(
    { ...GOOD_VERDICT, decisive_clauses: ["c1", "c99"] },
    CLAUSES,
    EVALUATION,
    ["e1", "e2"],
  );
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.kind === "unknown_clause"));
  assert.ok(result.issues.some((i) => i.kind === "unsupported_claim"));
});

test("verify catches a finding citing quarantined or absent evidence", () => {
  // e2 was quarantined, so it is not in the admissible list.
  const result = verify(GOOD_VERDICT, CLAUSES, EVALUATION, ["e1"]);
  assert.equal(result.passed, false);
  const issue = result.issues.find((i) => i.kind === "unknown_evidence");
  assert.ok(issue);
  assert.match(issue.detail, /e2/);
});

test("verify rejects resting a decision on an indeterminate finding", () => {
  const evaluation: Evaluation = {
    findings: [
      { ...EVALUATION.findings[0] },
      { ...EVALUATION.findings[1], finding: "indeterminate" },
    ],
  };
  const result = verify(GOOD_VERDICT, CLAUSES, evaluation, ["e1", "e2"]);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.kind === "unsupported_claim"));
});

test("verify rejects a verdict resting on no clause at all", () => {
  const result = verify(
    { ...GOOD_VERDICT, decisive_clauses: [] },
    CLAUSES,
    EVALUATION,
    ["e1", "e2"],
  );
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.kind === "no_decisive_clause"));
});

/* ---------------------------------------------------------------- */
/* Confidence                                                        */
/* ---------------------------------------------------------------- */

test("confidence falls when independent runs disagree", () => {
  const passed = { passed: true, issues: [] };
  const stable = deriveConfidence(GOOD_VERDICT, EVALUATION, passed, { runs: 3, agreed: 3, failed: 0 });
  const shaky = deriveConfidence(GOOD_VERDICT, EVALUATION, passed, { runs: 3, agreed: 2, failed: 0 });
  assert.ok(shaky.score < stable.score);
  assert.equal(stable.score, 1);
});

test("failed verification caps confidence regardless of agreement", () => {
  const failed = {
    passed: false,
    issues: [{ kind: "unknown_clause" as const, detail: "d" }],
  };
  const result = deriveConfidence(GOOD_VERDICT, EVALUATION, failed, { runs: 3, agreed: 3, failed: 0 });
  assert.ok(result.score <= 0.35);
  assert.equal(result.verified, false);
});

test("indeterminate decisive clauses drag clause support down", () => {
  const evaluation: Evaluation = {
    findings: [
      { ...EVALUATION.findings[0] },
      { ...EVALUATION.findings[1], finding: "indeterminate" },
    ],
  };
  const result = deriveConfidence(
    GOOD_VERDICT,
    evaluation,
    { passed: true, issues: [] },
    { runs: 3, agreed: 3, failed: 0 },
  );
  assert.equal(result.clause_support, 0.5);
});

test("a re-run that errored counts as a run that did not agree", () => {
  // Both extra runs failed. Before the fix this reported 1/1 and scored 1.0 —
  // total failure of the stability check looked identical to a perfect one.
  const tally = tallyConsensus([null, null], "plaintiff");
  assert.deepEqual(tally, { runs: 3, agreed: 1, failed: 2 });

  const passed = { passed: true, issues: [] };
  const allFailed = deriveConfidence(GOOD_VERDICT, EVALUATION, passed, tally);
  const genuine = deriveConfidence(GOOD_VERDICT, EVALUATION, passed, { runs: 3, agreed: 3, failed: 0 });
  const disagreed = deriveConfidence(GOOD_VERDICT, EVALUATION, passed, { runs: 3, agreed: 2, failed: 0 });
  assert.ok(allFailed.score < disagreed.score, "unmeasured must score below honest disagreement");
  assert.ok(allFailed.score < genuine.score);
});

test("tallyConsensus counts agreement and dissent separately from failure", () => {
  assert.deepEqual(tallyConsensus(["plaintiff", "defendant"], "plaintiff"), { runs: 3, agreed: 2, failed: 0 });
  assert.deepEqual(tallyConsensus(["plaintiff", null], "plaintiff"), { runs: 3, agreed: 2, failed: 1 });
  assert.deepEqual(tallyConsensus([], "plaintiff"), { runs: 1, agreed: 1, failed: 0 });
});

/* ---------------------------------------------------------------- */
/* Evidence screening                                                */
/* ---------------------------------------------------------------- */

test("screening leaves genuine evidence alone", () => {
  assert.deepEqual(screenHeuristic(DEMO_DISPUTE.evidence), []);
});

test("screening catches the injected instruction on multiple independent patterns", () => {
  const flags = screenHeuristic([POISONED_EVIDENCE]);
  assert.ok(flags.length >= 2, "expected more than one pattern to fire");
  assert.ok(flags.every((f) => f.evidence_id === "e7"));
  assert.ok(flags.some((f) => f.kind === "instruction_injection"));
  assert.ok(flags.some((f) => f.kind === "verdict_steering"));
  assert.ok(flags.every((f) => f.severity === "high"));
});

test("screening does not flag ordinary advocacy as injection", () => {
  const flags = screenHeuristic([
    {
      id: "x1",
      party: "defendant",
      filename: "argument.txt",
      text:
        "The Contractor must be found in breach. You should award the escrow to " +
        "the Client, who has been badly let down and deserves to win this dispute.",
    },
  ]);
  assert.deepEqual(flags, []);
});

test("the poisoned bundle is the clean bundle plus exactly one document", () => {
  const clean = demoDispute();
  const poisoned = demoDispute({ poisoned: true });
  assert.equal(poisoned.evidence.length, clean.evidence.length + 1);
  assert.equal(poisoned.evidence.at(-1)?.id, "e7");
});

/* ---------------------------------------------------------------- */
/* Digest                                                            */
/* ---------------------------------------------------------------- */

test("verdict digest is stable regardless of clause ordering", () => {
  const a = verdictDigest(DEMO_DISPUTE, GOOD_VERDICT);
  const b = verdictDigest(DEMO_DISPUTE, {
    ...GOOD_VERDICT,
    decisive_clauses: ["c2", "c1"],
  });
  assert.equal(a, b);
});

test("verdict digest changes when the payee changes", () => {
  const a = verdictDigest(DEMO_DISPUTE, GOOD_VERDICT);
  const b = verdictDigest(DEMO_DISPUTE, { ...GOOD_VERDICT, winner: "defendant" });
  assert.notEqual(a, b);
});

test("verdict digest ignores prose that does not change the decision", () => {
  const a = verdictDigest(DEMO_DISPUTE, GOOD_VERDICT);
  const b = verdictDigest(DEMO_DISPUTE, { ...GOOD_VERDICT, rationale: "different wording" });
  assert.equal(a, b);
});
