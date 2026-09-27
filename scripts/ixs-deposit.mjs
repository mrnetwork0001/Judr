// Request the agent's standing deposit into the IXS vault on Avalanche.
// Real money. Approves if needed, sends requestDeposit, waits for both
// receipts, and writes the request into src/lib/ixs-record.ts.
//   CDP_NETWORK=base node --env-file=.env.local --import ./scripts/ts-resolve.mjs scripts/ixs-deposit.mjs 100
import { writeFileSync } from "node:fs";
process.on("unhandledRejection", () => {});
const amount = process.argv[2] ?? "100";
const { requestDeposit, readPosition, POSITION_CHAIN } = await import("../src/lib/ixs-position.ts");
console.log(`requesting a ${amount} USDC deposit…`);
const r = await requestDeposit(amount);
console.log("approve:", r.approveTx ? `${POSITION_CHAIN.explorer}/tx/${r.approveTx}` : "(allowance already sufficient)");
console.log("requestDeposit:", `${POSITION_CHAIN.explorer}/tx/${r.requestTx}`, "· request id", r.requestId || "(unknown)", "· block", r.block);
const record = { txHash: r.requestTx, requestId: r.requestId, assetsUsdc: r.assetsUsdc, requestedAt: new Date().toISOString(), block: r.block };
writeFileSync(
  "src/lib/ixs-record.ts",
  `/**
 * The deposit request the agent made into the IXS vault, as it stands on
 * chain. Written by scripts/ixs-deposit.mjs when the request was sent; the
 * live state (pending, finalised, shares) is always read from the chain.
 */
import type { RecordedRequest } from "./ixs-position";

export const RECORDED_REQUEST: RecordedRequest | null = ${JSON.stringify(record, null, 2)};
`,
);
console.log("record written to src/lib/ixs-record.ts");
const p = await readPosition();
console.log("position now:", JSON.stringify({ status: p.status, pendingUsdc: p.pendingUsdc, shares: p.shares, agent: p.agent, error: p.error ?? null }));
process.exit(0);
