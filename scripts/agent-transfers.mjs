// Recent USDC transfers out of the escrow agent, read from the chain's logs.
//   node --env-file=.env.local scripts/agent-transfers.mjs
import { createPublicClient, http, parseAbiItem, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { CdpClient } from "@coinbase/cdp-sdk";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const { address } = await new CdpClient().evm.getOrCreateAccount({ name: "judr-escrow-agent-base-sepolia" });
const head = await pub.getBlockNumber();
const logs = await pub.getLogs({
  address: USDC,
  event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
  args: { from: address },
  fromBlock: head - 900n,
  toBlock: head,
});
console.log(`agent ${address} · ${logs.length} outgoing USDC transfer(s) in the last 900 blocks`);
for (const l of logs) console.log(`  ${formatUnits(l.args.value, 6)} USDC → ${l.args.to}  tx https://sepolia.basescan.org/tx/${l.transactionHash}`);
console.log("balance now:", formatUnits(await pub.readContract({ address: USDC, abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")], functionName: "balanceOf", args: [address] }), 6), "USDC");
