// End-to-end of wallet gating with real signatures: three throwaway keys play
// Contractor, Client and Reviewer against a running app (SERV key required).
//   node scripts/e2e-gating.mjs
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const base = "http://localhost:3000";
let cookie = "";
const call = async (body) => {
  const r = await fetch(`${base}/api/vault`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: r.status, data: await r.json() };
};
const join = async (role, account) => {
  const { data: prep } = await call({ action: "join-message", role, address: account.address });
  const signature = await account.signMessage({ message: prep.message });
  return call({ action: "join", role, address: account.address, signature });
};
const contractor = privateKeyToAccount(generatePrivateKey());
const client = privateKeyToAccount(generatePrivateKey());
const reviewer = privateKeyToAccount(generatePrivateKey());

let r = await call({ action: "reset" }); console.log("reset:", r.status, r.data.status, "| funding:", r.data.funding ? "yes" : "none (agent not configured)");
r = await join("plaintiff", contractor); console.log("join contractor:", r.status, r.data.plaintiff?.address === contractor.address ? "address recorded ✓" : r.data.error);
r = await call({ action: "join", role: "defendant", address: client.address, signature: "0xdeadbeef" }); console.log("forged join:", r.status, r.data.error);
r = await join("defendant", client); console.log("join client:", r.status, r.data.defendant?.address === client.address ? "address recorded ✓" : r.data.error);
// Arbitrate live (SSE) in this session.
const sse = await fetch(`${base}/api/arbitrate`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: "{}" });
const text = await sse.text(); const done = text.includes('"run_done"'); console.log("arbitrate:", sse.status, done ? "verdict posted ✓" : text.slice(0, 200));
r = await call({ action: "appeal", by: contractor.address }); console.log("appeal by winner:", r.status, r.data.error);
r = await call({ action: "appeal" }); console.log("appeal by nobody:", r.status, r.data.error);
r = await call({ action: "appeal", by: client.address }); console.log("appeal by client:", r.status, r.data.status);
r = await call({ action: "review", decision: "uphold", note: "Stands.", by: client.address }); console.log("review by client:", r.status, r.data.error);
r = await join("reviewer", reviewer); console.log("join reviewer:", r.status, r.data.participants?.length, "participants");
r = await call({ action: "review", decision: "uphold", note: "Stands.", by: reviewer.address }); console.log("review by reviewer:", r.status, r.data.error ?? r.data.status, "(a 503 'not configured' here is correct until CDP keys exist)");
