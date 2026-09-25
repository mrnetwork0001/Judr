/**
 * The vault carries the README's headline safety claim — "an appeal halts
 * settlement, and Judr cannot overrule one" — so its state machine is tested
 * transition by transition, including the ones that must be refused.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// The appeal window is read at module load, so it is set before the import.
process.env.JUDR_APPEAL_WINDOW_MS = "60";
const vault = await import("../vault");
const { appeal, getVault, postVerdict, raiseDispute, release, resetVault, VaultError } = vault;

import type { ArbitrationResult } from "../types";

const RESULT = {
  disputeId: "judr-test",
  verdict: { winner: "plaintiff", decisive_clauses: ["c1"] },
  confidence: { score: 1 },
  digest: "abc123",
} as unknown as ArbitrationResult;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const fresh = () => `session-${++n}`;

test("the happy path: fund → dispute → verdict → window closes → release", async () => {
  const sid = fresh();
  assert.equal(getVault(sid).status, "funded");
  raiseDispute(sid, "test");
  assert.equal(getVault(sid).status, "disputed");
  postVerdict(sid, RESULT);
  assert.equal(getVault(sid).status, "verdict_posted");
  assert.throws(() => release(sid), VaultError, "release inside the window must be refused");
  await wait(80);
  release(sid);
  assert.equal(getVault(sid).status, "released");
  assert.equal(getVault(sid).releasedTo?.name, getVault(sid).plaintiff.name);
});

test("an appeal is terminal: no re-run, no release, until a human intervenes", async () => {
  const sid = fresh();
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  appeal(sid, "disputed finding");
  assert.equal(getVault(sid).status, "appealed");

  // This is the sequence that used to erase the appeal and release the escrow.
  assert.throws(() => raiseDispute(sid, "again"), VaultError);
  assert.equal(getVault(sid).status, "appealed", "a refused dispute must not touch state");

  await wait(80);
  assert.throws(() => release(sid), VaultError, "release after the window must still be refused");
  assert.equal(getVault(sid).status, "appealed");
});

test("a verdict can only be posted on a disputed vault", () => {
  const sid = fresh();
  assert.throws(() => postVerdict(sid, RESULT), VaultError, "no dispute yet");
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  assert.throws(() => postVerdict(sid, RESULT), VaultError, "already posted");
});

test("an appeal is only possible while a verdict's window is open", async () => {
  const sid = fresh();
  assert.throws(() => appeal(sid, "x"), VaultError, "nothing to appeal");
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  await wait(80);
  assert.throws(() => appeal(sid, "x"), VaultError, "window closed");
});

test("a released vault is closed to everything except reset", async () => {
  const sid = fresh();
  raiseDispute(sid, "test");
  postVerdict(sid, RESULT);
  await wait(80);
  release(sid);
  assert.throws(() => raiseDispute(sid, "again"), VaultError);
  assert.throws(() => appeal(sid, "x"), VaultError);
  assert.equal(release(sid).status, "released", "release is idempotent");
  assert.equal(resetVault(sid).status, "funded");
});

test("sessions do not share a vault", () => {
  const a = fresh();
  const b = fresh();
  raiseDispute(a, "test");
  assert.equal(getVault(a).status, "disputed");
  assert.equal(getVault(b).status, "funded");
  resetVault(a);
  assert.equal(getVault(b).status, "funded");
});

test("refused transitions are VaultErrors, so the API can 409 them", () => {
  const sid = fresh();
  try {
    release(sid);
    assert.fail("expected a throw");
  } catch (error) {
    assert.ok(error instanceof VaultError);
    assert.equal((error as Error).name, "VaultError");
  }
});
