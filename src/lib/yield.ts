/**
 * Escrow yield arithmetic.
 *
 * While a dispute is open the escrow does not have to sit idle. Parked in a
 * licensed RWA vault it earns at the vault's rate, and Judr's fee is taken
 * from that yield rather than from either party's pocket. Everything here is
 * plain arithmetic over numbers the vault reports, so it can be tested
 * without a chain.
 *
 * Money is handled in integer minor units (USDC has six decimals) to avoid
 * floating-point drift on amounts that will be shown to the parties.
 */

export interface YieldTerms {
  /** Escrowed principal, in minor units. */
  principal: bigint;
  /** Annualised rate as a fraction, e.g. 0.0307 for 3.07%. */
  annualRate: number;
  /** How long the escrow was parked. */
  days: number;
  /** Judr's fee in basis points of the yield earned, e.g. 2500 = 25%. */
  feeBps: number;
  /** A floor on the fee, in minor units — applies only when yield covers it. */
  feeFloor?: bigint;
}

export interface YieldSplit {
  yieldEarned: bigint;
  fee: bigint;
  /** Principal plus the yield left after the fee. */
  payout: bigint;
  /** True when the fee was capped by the yield actually earned. */
  feeCapped: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Simple (non-compounding) accrual, which is what a share-price vault reports
 * over a short window. Rounded down: the vault never pays out more than it
 * earned and neither does Judr.
 */
export function accrue(principal: bigint, annualRate: number, days: number): bigint {
  if (principal <= 0n || annualRate <= 0 || days <= 0) return 0n;
  // Work in integer basis-point-days to keep the multiplication exact.
  const rateBpsDays = BigInt(Math.round(annualRate * 10_000 * days * 1_000));
  return (principal * rateBpsDays) / (10_000n * 365n * 1_000n);
}

/**
 * The split. The fee comes out of yield only — if the window was too short to
 * earn the floor, the fee is whatever was earned, and the parties owe nothing
 * further. Principal is never touched.
 */
export function splitYield(terms: YieldTerms): YieldSplit {
  const yieldEarned = accrue(terms.principal, terms.annualRate, terms.days);
  const proportional = (yieldEarned * BigInt(terms.feeBps)) / 10_000n;
  const wanted = terms.feeFloor !== undefined && terms.feeFloor > proportional ? terms.feeFloor : proportional;
  const fee = wanted > yieldEarned ? yieldEarned : wanted;
  return {
    yieldEarned,
    fee,
    payout: terms.principal + yieldEarned - fee,
    feeCapped: wanted > yieldEarned,
  };
}

/** Yield implied by two share-price observations, as an annualised fraction. */
export function impliedAnnualRate(
  priceThen: number,
  priceNow: number,
  elapsedMs: number,
): number {
  if (priceThen <= 0 || elapsedMs <= 0) return 0;
  const growth = priceNow / priceThen - 1;
  return growth * (365 * DAY_MS) / elapsedMs;
}

/** Share price from an ERC-4626/7540 vault's totals, normalised for decimals. */
export function sharePrice(
  totalAssets: bigint,
  assetDecimals: number,
  totalSupply: bigint,
  shareDecimals: number,
): number {
  if (totalSupply === 0n) return 1;
  const assets = Number(totalAssets) / 10 ** assetDecimals;
  const shares = Number(totalSupply) / 10 ** shareDecimals;
  return assets / shares;
}

/** Minor units → a display string with the asset's decimals. */
export function formatMinor(amount: bigint, decimals: number, maxFraction = 2): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / 10n ** BigInt(decimals);
  const frac = abs % 10n ** BigInt(decimals);
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFraction);
  const wholeStr = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeStr}${maxFraction > 0 ? "." + fracStr : ""}`;
}
