/**
 * The fee-from-yield model is a revenue claim, so the arithmetic behind it is
 * pinned down here: the fee never exceeds yield, principal is never touched,
 * and the numbers a judge will see on screen come from these functions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { accrue, splitYield, impliedAnnualRate, sharePrice, formatMinor } from "../yield";

const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));

test("accrues simple interest, rounded down", () => {
  // 10,000 USDC at 3.07% for 30 days ≈ 25.23 USDC
  const y = accrue(USDC(10_000), 0.0307, 30);
  assert.equal(formatMinor(y, 6), "25.23");
  assert.equal(accrue(USDC(10_000), 0.0307, 0), 0n);
  assert.equal(accrue(0n, 0.0307, 30), 0n);
});

test("the fee comes out of yield and never touches principal", () => {
  const s = splitYield({ principal: USDC(10_000), annualRate: 0.0307, days: 30, feeBps: 2500 });
  assert.equal(formatMinor(s.yieldEarned, 6), "25.23");
  assert.equal(formatMinor(s.fee, 6), "6.30");
  assert.ok(s.payout > USDC(10_000), "winner receives principal plus net yield");
  assert.equal(s.payout, USDC(10_000) + s.yieldEarned - s.fee);
  assert.equal(s.feeCapped, false);
});

test("a fee floor applies only when yield covers it", () => {
  const long = splitYield({ principal: USDC(10_000), annualRate: 0.0307, days: 90, feeBps: 2500, feeFloor: USDC(20) });
  assert.equal(formatMinor(long.fee, 6), "20.00");
  assert.equal(long.feeCapped, false);

  // A one-day dispute earns 84 cents; the floor cannot be met, so the fee is
  // the 84 cents and nothing more is owed.
  const short = splitYield({ principal: USDC(10_000), annualRate: 0.0307, days: 1, feeBps: 2500, feeFloor: USDC(20) });
  assert.equal(short.fee, short.yieldEarned);
  assert.equal(short.feeCapped, true);
  assert.equal(short.payout, USDC(10_000));
});

test("share price and implied rate follow the vault's totals", () => {
  // The live IXHYB read on 26 Sep 2026: 402.614429 USDC over 369.293789… shares.
  const p = sharePrice(402_614_429n, 6, 369_293_789_548_844_955_716n, 18);
  assert.ok(Math.abs(p - 1.0902) < 0.001, `share price ${p}`);

  const thirtyDays = 30 * 86_400_000;
  const r = impliedAnnualRate(1.0, 1.0025, thirtyDays);
  assert.ok(Math.abs(r - 0.0304) < 0.001, `implied rate ${r}`);
  assert.equal(impliedAnnualRate(0, 1, thirtyDays), 0);
});

test("formats minor units without floating-point drift", () => {
  assert.equal(formatMinor(10_000_000_000n, 6), "10,000.00");
  assert.equal(formatMinor(1_234_567n, 6), "1.23");
  assert.equal(formatMinor(-500_000n, 6), "-0.50");
  assert.equal(formatMinor(42n, 6, 6), "0.000042");
});
