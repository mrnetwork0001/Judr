// Can two simultaneous release calls in one session pay twice? They must not.
//   BASE=http://localhost:3000 node scripts/e2e-race.mjs
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const base = process.env.BASE ?? "http://localhost:3000";
let cookie = "";
const call = async (body) => {
  const r = await fetch(`${base}/api/vault`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: r.status, data: await r.json() };
};
const winner = privateKeyToAccount(generatePrivateKey());
await call({ action: "reset" });
const { data: prep } = await call({ action: "join-message", role: "plaintiff", address: winner.address });
await call({ action: "join", role: "plaintiff", address: winner.address, signature: await winner.signMessage({ message: prep.message }) });
const sse = await fetch(`${base}/api/arbitrate`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: "{}" });
console.log("arbitrate:", (await sse.text()).includes('"run_done"') ? "verdict ✓" : "no verdict");
const v = await (await fetch(`${base}/api/vault`, { headers: { cookie } })).json();
await new Promise((r) => setTimeout(r, Math.max(0, v.verdict.appealDeadline - Date.now()) + 1500));
// Fire five releases at once.
const results = await Promise.all(Array.from({ length: 5 }, () => call({ action: "release" })));
const paid = results.filter((r) => r.status === 200 && r.data.settlement?.payoutTx);
const hashes = new Set(paid.map((r) => r.data.settlement.payoutTx));
console.log("statuses:", results.map((r) => r.status).join(" "), "| distinct payout txs:", hashes.size, hashes.size > 1 ? "❌ DOUBLE PAYOUT" : "✓");
for (const r of results) if (r.status !== 200) console.log("  refused:", r.data.error);
