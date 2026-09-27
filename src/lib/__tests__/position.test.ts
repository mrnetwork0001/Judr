import { test } from "node:test";
import assert from "node:assert/strict";
import { describePosition } from "../ixs-position";

const none = { shareBalance: 0n, assetBalance: 0n, pendingDeposit: 0n, claimableDeposit: 0n, pendingRedeem: 0n, claimableRedeem: 0n };
const request = { txHash: "0xabc" as const, requestId: "10", assetsUsdc: "100", requestedAt: "2026-09-27T00:00:00Z", block: 1 };

test("no request and nothing on chain is no position", () => {
  assert.equal(describePosition(none, null), "none");
});

test("a recorded request with nothing on chain yet reads as pending", () => {
  assert.equal(describePosition(none, request), "pending");
});

test("assets with IXS custody read as pending", () => {
  assert.equal(describePosition({ ...none, pendingDeposit: 100_000_000n }, null), "pending");
});

test("finalised but unclaimed reads as claimable, shares held as finalised", () => {
  assert.equal(describePosition({ ...none, claimableDeposit: 100_000_000n }, request), "claimable");
  assert.equal(describePosition({ ...none, shareBalance: 91n * 10n ** 18n }, request), "finalised");
});
