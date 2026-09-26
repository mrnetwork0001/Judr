// Escrow agent diagnostics: balances, a faucet round, balances again.
//   node --env-file=.env.local scripts/agent-diag.mjs
import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const cdp = new CdpClient();
const account = await cdp.evm.getOrCreateAccount({ name: "judr-escrow-agent-base-sepolia" });
console.log("agent:", account.address);
const bal = async () => ({
  usdc: formatUnits(await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }), 6),
  eth: formatUnits(await pub.getBalance({ address: account.address }), 18),
});
console.log("before:", await bal());
for (const token of ["eth", "usdc"]) {
  try {
    const r = await cdp.evm.requestFaucet({ address: account.address, network: "base-sepolia", token });
    console.log(`faucet ${token}: tx`, r.transactionHash);
    const rcpt = await pub.waitForTransactionReceipt({ hash: r.transactionHash, timeout: 120_000 });
    console.log(`  status ${rcpt.status} · block ${rcpt.blockNumber} · logs ${rcpt.logs.length}`);
  } catch (e) {
    console.log(`faucet ${token} FAILED:`, (e?.message ?? String(e)).slice(0, 400));
    if (e?.errorType || e?.statusCode) console.log("  detail:", e.errorType, e.statusCode, e.errorMessage);
  }
}
console.log("after:", await bal());
try {
  const tb = await cdp.evm.listTokenBalances({ address: account.address, network: "base-sepolia" });
  console.log("cdp token balances:", tb.balances.map((b) => `${b.token.symbol ?? b.token.contractAddress}=${b.amount.amount}/${b.amount.decimals}`).join(", ") || "(none)");
} catch (e) { console.log("listTokenBalances failed:", (e?.message ?? e).slice?.(0, 200)); }
