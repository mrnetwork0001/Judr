/**
 * The case record carries the README's headline safety claims - an appeal
 * halts settlement and only a person can end it; only the losing party can
 * appeal; a payout needs a proven address - so its state machine is tested
 * transition by transition, including the ones that must be refused. It is
 * pure: the on-chain transfer happens in the route between prepare and
 * complete, and here it is a stub.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JUDR_APPEAL_WINDOW_MS = "60";
const vault = await import("../vault");
const {
  appeal,
  completeRelease,
  completeReview,
  getVault,
  joinAs,
  postVerdict,
  prepareRelease,
  prepareReview,
  raiseDispute,
  resetVault,
  abortSettlement,
  VaultError,
} = vault;

import type { ArbitrationResult } from "../types";

const RESULT = {
  disputeId: "judr-test",
  verdict: { winner: "plaintiff", decisive_clauses: ["c1"] },
  confidence: { score: 1 },
  digest: "abc123",
} as unknown as ArbitrationResult;

const CONTRACTOR = "0x1111111111111111111111111111111111111111";
const CLIENT = "0x2222222222222222222222222222222222222222";
const REVIEWER = "0x3333333333333333333333333333333333333333";
const PAID = { txHash: "0xabc", explorerUrl: "https://sepolia.basescan.org/tx/0xabc" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const fresh = () => `session-${++n}`;

test("the happy path: parties sign in, verdict, window closes, real payee, release", async () => {
  const sid = fresh();
  joinAs(sid, "plaintiff", CONTRACTOR);
  joinAs(sid, "defendant", CLIENT);
  assert.equal(getVault(sid).plaintiff.address, CONTRACTOR);
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  assert.throws(() => prepareRelease(sid), VaultError, "release inside the window must be refused");
  await wait(80);
  const { payee, amount } = prepareRelease(sid);
  assert.equal(payee.address, CONTRACTOR);
  assert.equal(amount, getVault(sid).amount);
  const v = completeRelease(sid, PAID);
  assert.equal(v.status, "released");
  assert.equal(v.settlement?.payoutTx, "0xabc");
  assert.equal(v.settlement?.fee, "0", "nothing was deposited, so nothing is taken");
  assert.equal(v.settlement?.payout, v.settlement?.principal);
});

test("a payout has nowhere to go until the winner has signed in", async () => {
  const sid = fresh();
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  await wait(80);
  assert.throws(() => prepareRelease(sid), /has not connected a wallet/);
  joinAs(sid, "plaintiff", CONTRACTOR);
  assert.equal(prepareRelease(sid).payee.address, CONTRACTOR);
});

test("only the losing party's signed-in wallet can appeal", () => {
  const sid = fresh();
  joinAs(sid, "plaintiff", CONTRACTOR);
  joinAs(sid, "defendant", CLIENT);
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  assert.throws(() => appeal(sid, "x"), /Only the losing party/, "no wallet");
  assert.throws(() => appeal(sid, "x", CONTRACTOR), /Only the losing party/, "the winner cannot appeal");
  assert.equal(appeal(sid, "x", CLIENT).status, "appealed");
});

test("an appeal is terminal for Judr: no re-run, no release", async () => {
  const sid = fresh();
  joinAs(sid, "defendant", CLIENT);
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  appeal(sid, "disputed finding", CLIENT);
  assert.throws(() => raiseDispute(sid, "again"), VaultError);
  await wait(80);
  assert.throws(() => prepareRelease(sid), VaultError);
  assert.equal(getVault(sid).status, "appealed");
});

test("only a signed-in reviewer can decide an appeal; uphold pays the winner", () => {
  const sid = fresh();
  joinAs(sid, "plaintiff", CONTRACTOR);
  joinAs(sid, "defendant", CLIENT);
  joinAs(sid, "reviewer", REVIEWER);
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  appeal(sid, "disputed", CLIENT);
  assert.throws(() => prepareReview(sid, "uphold", "x", CLIENT), /reviewer/);
  assert.throws(() => prepareReview(sid, "uphold", "   ", REVIEWER), /reason/);
  assert.equal(prepareReview(sid, "uphold", "Stands.", REVIEWER).payee.address, CONTRACTOR);
  const v = completeReview(sid, "uphold", "Stands.", PAID);
  assert.equal(v.status, "released");
  assert.equal(v.releasedTo?.address, CONTRACTOR);
  assert.equal(v.review?.decision, "uphold");
});

test("overturning pays the other party, who must also have signed in", () => {
  const sid = fresh();
  joinAs(sid, "plaintiff", CONTRACTOR);
  joinAs(sid, "reviewer", REVIEWER);
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  // The client appeals... but never signed in, so cannot. Sign in, appeal, then leave.
  joinAs(sid, "defendant", CLIENT);
  appeal(sid, "disputed", CLIENT);
  const { payee } = prepareReview(sid, "overturn", "The notice was in time.", REVIEWER);
  assert.equal(payee.address, CLIENT);
  const v = completeReview(sid, "overturn", "The notice was in time.", PAID);
  assert.equal(v.releasedTo?.address, CLIENT);
});

test("one address holds one role at a time", () => {
  const sid = fresh();
  joinAs(sid, "plaintiff", CONTRACTOR);
  joinAs(sid, "reviewer", CONTRACTOR);
  const v = getVault(sid);
  assert.equal(v.participants.length, 1);
  assert.equal(v.participants[0].role, "reviewer");
  assert.equal(v.plaintiff.address, null, "the party slot is vacated");
});

test("sessions do not share a case", () => {
  const a = fresh();
  const b = fresh();
  raiseDispute(a, "test");
  assert.equal(getVault(a).status, "disputed");
  assert.equal(getVault(b).status, "funded");
  resetVault(a);
  assert.equal(getVault(b).status, "funded");
});

test("a payout in flight blocks a second one until it completes or is aborted", async () => {
  const sid = fresh();
  joinAs(sid, "plaintiff", CONTRACTOR);
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  await wait(80);
  prepareRelease(sid);
  assert.throws(() => prepareRelease(sid), /already in flight/, "second prepare refused while the first is paying");
  abortSettlement(sid);
  prepareRelease(sid);
  completeRelease(sid, PAID);
  assert.throws(() => prepareRelease(sid), /Already released/);
});
