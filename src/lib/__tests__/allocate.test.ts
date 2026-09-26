/**
 * The allocation policy is the guardrail between a model's proposal and the
 * escrow moving. It is deterministic and it is tested like the verifier: every
 * refusal, and the one shape of acceptance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAllocation, RECORDED_DECISION, renderVaults } from "../graph/allocate";
import { RECORDED_SNAPSHOT } from "../ixs";
import type { IxsSnapshot } from "../ixs";

const snapshot: IxsSnapshot = RECORDED_SNAPSHOT;
const permissionless = snapshot.vaults.find((v) => v.permissionless)!;
const whitelisted = snapshot.vaults.find((v) => !v.permissionless)!;

test("the recorded decision passes policy against the recorded snapshot", () => {
  const c = checkAllocation(RECORDED_DECISION, snapshot);
  assert.equal(c.accepted, true, c.reasons.join("; "));
  assert.equal(c.vault?.id, permissionless.id);
});

test("holding cash is always an acceptable answer", () => {
  const c = checkAllocation({ ...RECORDED_DECISION, allocate: false, vault_id: "" }, snapshot);
  assert.equal(c.accepted, true);
  assert.equal(c.vault, undefined);
});

test("a vault that is not in the IXS list is refused", () => {
  const c = checkAllocation({ ...RECORDED_DECISION, vault_id: "made-up" }, snapshot);
  assert.equal(c.accepted, false);
  assert.match(c.reasons[0], /not in the IXS list/);
});

test("a whitelisted vault is refused: the escrow agent is on no whitelist", () => {
  const c = checkAllocation({ ...RECORDED_DECISION, vault_id: whitelisted.id }, snapshot);
  assert.equal(c.accepted, false);
  assert.ok(c.reasons.some((r) => /whitelist/.test(r)));
});

test("a paused vault and a zero rate are refused", () => {
  const paused: IxsSnapshot = {
    ...snapshot,
    vaults: snapshot.vaults.map((v) => (v.id === permissionless.id ? { ...v, status: "paused", ttmRate: 0 } : v)),
  };
  const c = checkAllocation(RECORDED_DECISION, paused);
  assert.equal(c.accepted, false);
  assert.ok(c.reasons.some((r) => /paused/.test(r)));
  assert.ok(c.reasons.some((r) => /below/.test(r)));
});

test("an allocation with no stated risk is refused", () => {
  const c = checkAllocation({ ...RECORDED_DECISION, risks: [] }, snapshot);
  assert.equal(c.accepted, false);
  assert.ok(c.reasons.some((r) => /risk/.test(r)));
});

test("the vault list rendered for the model states access and provenance", () => {
  const text = renderVaults(snapshot);
  assert.match(text, /permissionless/);
  assert.match(text, /whitelist required/);
  assert.match(text, /TTM yield \(as reported by IXS\)/);
  assert.match(text, /on-chain now/);
});
