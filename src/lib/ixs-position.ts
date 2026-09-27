/**
 * The agent's standing position in an IXS vault.
 *
 * The IXS track counts real value in the vault, and the vault's contract sets
 * a 100 USDC minimum, forwards deposits to custody at once, and leaves
 * finalisation to an IXS operator, hours to days by its history. A dispute
 * that lasts minutes cannot hold its own position, so the agent holds one
 * standing position in the permissionless Avalanche vault and cases account
 * against it. This module makes that position: the agent's CDP key signs
 * Avalanche transactions through viem, IXS's SDK builds the calls and reads
 * the state, and nothing here is cached longer than a minute.
 */
import { CdpClient } from "@coinbase/cdp-sdk";
import {
  KNOWN_VAULTS,
  buildApproveTx,
  buildRequestDepositTx,
  fetchLatestRequestIds,
  readUserPosition,
  readVaultState,
  type UserPosition,
  type VaultConfig,
} from "@ixswap1/vault-agent-sdk";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { toAccount } from "viem/accounts";
import { avalanche } from "viem/chains";
import { AGENT_NAME, escrowConfigured } from "./escrow";
import { RECORDED_REQUEST } from "./ixs-record";

export const POSITION_VAULT: VaultConfig =
  Object.values(KNOWN_VAULTS).find((v) => v.address.toLowerCase() === "0xad01573b459805e3954398796203d830b57a8bd9") ??
  Object.values(KNOWN_VAULTS)[0];
export const POSITION_CHAIN = { id: 43114, name: "Avalanche C-Chain", explorer: "https://snowscan.xyz" };
const RPC = process.env.AVALANCHE_RPC_URL ?? "https://api.avax.network/ext/bc/C/rpc";
const USDC: Address = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
const USDC_DECIMALS = 6;
const SHARE_DECIMALS = 18;

const VAULT_VIEWS = parseAbi([
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function minDepositAssets() view returns (uint256)",
  "function paused() view returns (bool)",
  "event DepositRequested(uint256 indexed id, address indexed controller, uint256 assets, uint256 subscribeFeeBpsAtRequest)",
]);
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

/** The on-chain record of the deposit request, written once it was made. */
export interface RecordedRequest {
  txHash: Hex;
  requestId: string;
  assetsUsdc: string;
  requestedAt: string;
  block: number;
}

export interface Position {
  vault: Address;
  vaultName: string | null;
  chain: typeof POSITION_CHAIN;
  agent: Address | null;
  /** Requested, still with IXS custody awaiting finalisation. */
  pendingUsdc: string;
  /** Finalised by IXS but not yet claimed as shares. */
  claimableUsdc: string;
  shares: string;
  /** Indicative price per share, as the vault reports it. */
  sharePriceUsdc: string;
  /** Shares at the indicative price. */
  valueUsdc: string;
  pendingRedeemShares: string;
  claimableRedeemUsdc: string;
  totalAssetsUsdc: string;
  minDepositUsdc: string;
  paused: boolean;
  status: "none" | "pending" | "finalised" | "claimable";
  request: RecordedRequest | null;
  explorerUrl: string;
  requestUrl: string | null;
  readAt: number;
  error?: string;
}

const publicClient = () => createPublicClient({ chain: avalanche, transport: http(RPC) });

/** The escrow agent's account, made into a viem account that signs through CDP. */
async function agentAccount() {
  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: AGENT_NAME });
  return toAccount({
    address: account.address,
    signMessage: (args) => account.signMessage(args),
    signTransaction: (tx) => account.signTransaction(tx),
    signTypedData: (args) => account.signTypedData(args),
  });
}

const fmt6 = (v: bigint | null) => formatUnits(v ?? 0n, USDC_DECIMALS);

export function describePosition(p: UserPosition, request: RecordedRequest | null): Position["status"] {
  if ((p.claimableDeposit ?? 0n) > 0n) return "claimable";
  if ((p.shareBalance ?? 0n) > 0n) return "finalised";
  if ((p.pendingDeposit ?? 0n) > 0n || request) return "pending";
  return "none";
}

const store = globalThis as unknown as { __judrPosition?: { at: number; value: Position } };
const TTL_MS = 60_000;

/** The position as the chain reports it right now, cached for a minute. */
export async function readPosition(): Promise<Position> {
  const cached = store.__judrPosition;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const request = RECORDED_REQUEST;
  const base: Position = {
    vault: POSITION_VAULT.address,
    vaultName: null,
    chain: POSITION_CHAIN,
    agent: null,
    pendingUsdc: "0",
    claimableUsdc: "0",
    shares: "0",
    sharePriceUsdc: "0",
    valueUsdc: "0",
    pendingRedeemShares: "0",
    claimableRedeemUsdc: "0",
    totalAssetsUsdc: "0",
    minDepositUsdc: "0",
    paused: false,
    status: request ? "pending" : "none",
    request,
    explorerUrl: `${POSITION_CHAIN.explorer}/address/${POSITION_VAULT.address}`,
    requestUrl: request ? `${POSITION_CHAIN.explorer}/tx/${request.txHash}` : null,
    readAt: Date.now(),
  };
  if (!escrowConfigured()) return { ...base, error: "Escrow agent is not configured." };
  try {
    const client = publicClient();
    const agent = (await agentAccount()).address;
    const [state, sharePrice, minDeposit, paused] = await Promise.all([
      readVaultState(client, POSITION_VAULT),
      client.readContract({ address: POSITION_VAULT.address, abi: VAULT_VIEWS, functionName: "convertToAssets", args: [10n ** 18n] }),
      client.readContract({ address: POSITION_VAULT.address, abi: VAULT_VIEWS, functionName: "minDepositAssets" }),
      client.readContract({ address: POSITION_VAULT.address, abi: VAULT_VIEWS, functionName: "paused" }),
    ]);
    const position = await readUserPosition(client, POSITION_VAULT, agent, state.assetAddress ?? USDC);
    const shares = position.shareBalance ?? 0n;
    const value = (shares * sharePrice) / 10n ** BigInt(SHARE_DECIMALS);
    const result: Position = {
      ...base,
      vaultName: state.name,
      agent,
      pendingUsdc: fmt6(position.pendingDeposit),
      claimableUsdc: fmt6(position.claimableDeposit),
      shares: formatUnits(shares, SHARE_DECIMALS),
      sharePriceUsdc: fmt6(sharePrice),
      valueUsdc: fmt6(value),
      pendingRedeemShares: formatUnits(position.pendingRedeem ?? 0n, SHARE_DECIMALS),
      claimableRedeemUsdc: fmt6(position.claimableRedeem),
      totalAssetsUsdc: fmt6(state.totalAssets),
      minDepositUsdc: fmt6(minDeposit),
      paused,
      status: describePosition(position, request),
      readAt: Date.now(),
    };
    store.__judrPosition = { at: Date.now(), value: result };
    return result;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface DepositReceipt {
  approveTx: Hex | null;
  requestTx: Hex;
  requestId: string;
  block: number;
  assetsUsdc: string;
}

/**
 * Request a deposit of `amountUsdc` into the vault from the agent. Approves
 * first if the allowance is short, waits for each receipt, and returns the
 * request id the vault assigned. Real money; the caller decides.
 */
export async function requestDeposit(amountUsdc: string): Promise<DepositReceipt> {
  const client = publicClient();
  const account = await agentAccount();
  const wallet = createWalletClient({ account, chain: avalanche, transport: http(RPC) });
  const assets = parseUnits(amountUsdc, USDC_DECIMALS);
  const [balance, allowance, minDeposit, paused] = await Promise.all([
    client.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [account.address] }),
    client.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [account.address, POSITION_VAULT.address] }),
    client.readContract({ address: POSITION_VAULT.address, abi: VAULT_VIEWS, functionName: "minDepositAssets" }),
    client.readContract({ address: POSITION_VAULT.address, abi: VAULT_VIEWS, functionName: "paused" }),
  ]);
  if (paused) throw new Error("The vault is paused.");
  if (assets < minDeposit) throw new Error(`Below the vault's minimum of ${fmt6(minDeposit)} USDC.`);
  if (balance < assets) throw new Error(`Agent holds ${fmt6(balance)} USDC on Avalanche, less than ${amountUsdc}.`);

  let approveTx: Hex | null = null;
  if (allowance < assets) {
    const tx = buildApproveTx(POSITION_VAULT, USDC, amountUsdc, USDC_DECIMALS);
    approveTx = await wallet.writeContract({ address: tx.address, abi: tx.abi as never, functionName: tx.functionName as never, args: tx.args as never });
    const r = await client.waitForTransactionReceipt({ hash: approveTx, timeout: 120_000 });
    if (r.status !== "success") throw new Error(`Approve reverted: ${approveTx}`);
  }
  const tx = buildRequestDepositTx(POSITION_VAULT, account.address, amountUsdc, USDC_DECIMALS);
  const requestTx = await wallet.writeContract({ address: tx.address, abi: tx.abi as never, functionName: tx.functionName as never, args: tx.args as never });
  const receipt = await client.waitForTransactionReceipt({ hash: requestTx, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`requestDeposit reverted: ${requestTx}`);
  let requestId = "";
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: VAULT_VIEWS, data: log.data, topics: log.topics });
      if (ev.eventName === "DepositRequested") requestId = (ev.args as { id: bigint }).id.toString();
    } catch {
      /* not ours */
    }
  }
  if (!requestId) {
    const ids = await fetchLatestRequestIds(POSITION_VAULT, account.address).catch(() => null);
    requestId = ids?.depositPendingId ?? "";
  }
  store.__judrPosition = undefined;
  return { approveTx, requestTx, requestId, block: Number(receipt.blockNumber), assetsUsdc: amountUsdc };
}
