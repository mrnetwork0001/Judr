/**
 * The escrow agent — a real wallet on Base Sepolia, run through Coinbase
 * AgentKit.
 *
 * The agent holds the escrow as testnet USDC, tops itself up from Coinbase's
 * faucet when it runs low, and pays the winning party on release with a real
 * on-chain transfer. Every hash it produces is a BaseScan link. There is no
 * pretend balance anywhere: if the keys are missing, the app says the agent is
 * not configured and refuses to claim funds it does not hold.
 *
 * The account is named, so the same address survives restarts and deploys.
 */

import { AgentKit, CdpEvmWalletProvider, cdpApiActionProvider, erc20ActionProvider, walletActionProvider } from "@coinbase/agentkit";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { CHAINS, type ChainInfo } from "./identity";

/**
 * Testnet by default. Setting CDP_NETWORK=base moves the agent to Base
 * mainnet: same code, real USDC, no faucet, and the caps below become the
 * only thing standing between a public demo and an empty wallet.
 */
type Network = keyof typeof CHAINS;
export const NETWORK: Network = process.env.CDP_NETWORK === "base" ? "base" : "base-sepolia";
export const CHAIN: ChainInfo = CHAINS[NETWORK];
export const IS_MAINNET = NETWORK === "base";

/** Circle's USDC on each network. */
const USDC_BY_NETWORK: Record<Network, Address> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
export const USDC: Address = USDC_BY_NETWORK[NETWORK];
export const USDC_DECIMALS = 6;
const AGENT_NAME = process.env.CDP_AGENT_NAME ?? `judr-escrow-agent-${NETWORK}`;

/**
 * Payout caps. A public demo that pays whoever wins a case is a faucet unless
 * bounded: one payout per address per day, a daily outflow ceiling, and a
 * switch. In memory — they reset with the process — which is acceptable for
 * a wallet holding pocket money and not otherwise.
 */
export const CAPS = {
  enabled: process.env.JUDR_PAYOUTS !== "off",
  perAddressPerDay: Number(process.env.JUDR_PAYOUTS_PER_ADDRESS_PER_DAY ?? "1"),
  dailyOutflowUsdc: Number(process.env.JUDR_DAILY_OUTFLOW_USDC ?? (IS_MAINNET ? "5" : "50")),
};

const ledger = globalThis as unknown as { __judrPayouts?: Array<{ to: string; amount: number; at: number }> };
function recentPayouts(now = Date.now()) {
  if (!ledger.__judrPayouts) ledger.__judrPayouts = [];
  ledger.__judrPayouts = ledger.__judrPayouts.filter((p) => now - p.at < 86_400_000);
  return ledger.__judrPayouts;
}

export function payoutAllowed(to: Address, amount: number): { ok: true } | { ok: false; reason: string } {
  if (!CAPS.enabled) return { ok: false, reason: "Payouts are switched off (JUDR_PAYOUTS=off)." };
  const recent = recentPayouts();
  const toThis = recent.filter((p) => p.to.toLowerCase() === to.toLowerCase()).length;
  if (toThis >= CAPS.perAddressPerDay) return { ok: false, reason: `This address has already received ${toThis} payout(s) today; the cap is ${CAPS.perAddressPerDay}.` };
  const outflow = recent.reduce((n, p) => n + p.amount, 0);
  if (outflow + amount > CAPS.dailyOutflowUsdc) return { ok: false, reason: `Today's payouts (${outflow.toFixed(2)} USDC) plus this one would exceed the daily ceiling of ${CAPS.dailyOutflowUsdc} USDC.` };
  return { ok: true };
}

export interface EscrowStatus {
  configured: boolean;
  address?: Address;
  network: string;
  mainnet: boolean;
  chain: ChainInfo;
  explorer: string;
  caps: typeof CAPS;
  usdc?: string;
  eth?: string;
  /** What the agent can do, as AgentKit names it. Shown in the trail. */
  actions?: string[];
  error?: string;
}

export interface Payout {
  txHash: Hex;
  explorerUrl: string;
  to: Address;
  amount: string;
}

export function escrowConfigured(): boolean {
  return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET);
}

const store = globalThis as unknown as { __judrAgent?: Promise<{ provider: CdpEvmWalletProvider; kit: AgentKit }> };

async function agent() {
  if (!escrowConfigured()) throw new Error("Escrow agent is not configured (CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET).");
  if (!store.__judrAgent) {
    store.__judrAgent = (async () => {
      const bootstrap = await CdpEvmWalletProvider.configureWithWallet({ networkId: NETWORK });
      // A named account so the address is the same every time the process starts.
      const account = await bootstrap.getClient().evm.getOrCreateAccount({ name: AGENT_NAME });
      const provider = await CdpEvmWalletProvider.configureWithWallet({ networkId: NETWORK, address: account.address });
      const kit = await AgentKit.from({
        walletProvider: provider,
        actionProviders: [walletActionProvider(), erc20ActionProvider(), cdpApiActionProvider()],
      });
      return { provider, kit };
    })().catch((error) => {
      store.__judrAgent = undefined;
      throw error;
    });
  }
  return store.__judrAgent;
}

async function usdcBalance(provider: CdpEvmWalletProvider): Promise<bigint> {
  return provider.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [provider.getAddress() as Address],
  });
}

export async function escrowStatus(): Promise<EscrowStatus> {
  const base = { network: NETWORK, mainnet: IS_MAINNET, chain: CHAIN, explorer: CHAIN.explorer, caps: CAPS };
  if (!escrowConfigured()) return { ...base, configured: false };
  try {
    const { provider, kit } = await agent();
    const [usdc, eth] = await Promise.all([usdcBalance(provider), provider.getBalance()]);
    return {
      ...base,
      configured: true,
      address: provider.getAddress() as Address,
      usdc: formatUnits(usdc, USDC_DECIMALS),
      eth: formatUnits(eth, 18),
      actions: kit.getActions().map((a) => a.name),
    };
  } catch (error) {
    return { ...base, configured: true, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface Funding {
  address: Address;
  usdc: string;
  eth: string;
  /** Faucet transactions this call made, if the balance was short. */
  faucet: Array<{ token: "usdc" | "eth"; txHash: Hex; explorerUrl: string }>;
}

/**
 * Makes sure the agent holds at least `amountUsdc` and a little gas, drawing
 * on Coinbase's testnet faucet when it does not. Faucets are rate-limited; a
 * refusal is reported, not papered over.
 */
export async function ensureFunded(amountUsdc: number): Promise<Funding> {
  const { provider } = await agent();
  const client = provider.getClient();
  const address = provider.getAddress() as Address;
  const faucet: Funding["faucet"] = [];
  const need = parseUnits(String(amountUsdc), USDC_DECIMALS);

  let usdc = await usdcBalance(provider);
  let eth = await provider.getBalance();
  if (!IS_MAINNET) {
    if (usdc < need) {
      const { transactionHash } = await client.evm.requestFaucet({ address, network: "base-sepolia", token: "usdc" });
      faucet.push({ token: "usdc", txHash: transactionHash, explorerUrl: `${CHAIN.explorer}/tx/${transactionHash}` });
      await provider.waitForTransactionReceipt(transactionHash);
      usdc = await usdcBalance(provider);
    }
    if (eth < parseUnits("0.0005", 18)) {
      const { transactionHash } = await client.evm.requestFaucet({ address, network: "base-sepolia", token: "eth" });
      faucet.push({ token: "eth", txHash: transactionHash, explorerUrl: `${CHAIN.explorer}/tx/${transactionHash}` });
      await provider.waitForTransactionReceipt(transactionHash);
      eth = await provider.getBalance();
    }
  }
  if (usdc < need) {
    throw new Error(
      `Escrow agent ${address} holds ${formatUnits(usdc, USDC_DECIMALS)} USDC on ${CHAIN.name}, less than the ${amountUsdc} USDC escrow.` +
        (IS_MAINNET ? " Fund it before opening cases." : " The faucet did not cover it."),
    );
  }
  if (eth < parseUnits("0.0002", 18)) {
    throw new Error(`Escrow agent ${address} has ${formatUnits(eth, 18)} ETH on ${CHAIN.name}; it cannot pay gas.`);
  }
  return { address, usdc: formatUnits(usdc, USDC_DECIMALS), eth: formatUnits(eth, 18), faucet };
}

/** The payout: a real ERC-20 transfer from the agent to the winner. */
export async function payout(to: Address, amountUsdc: number): Promise<Payout> {
  const allowed = payoutAllowed(to, amountUsdc);
  if (!allowed.ok) throw new Error(allowed.reason);
  const { provider } = await agent();
  const amount = parseUnits(String(amountUsdc), USDC_DECIMALS);
  const balance = await usdcBalance(provider);
  if (balance < amount) {
    throw new Error(`Escrow agent holds ${formatUnits(balance, USDC_DECIMALS)} USDC; cannot pay ${amountUsdc}.`);
  }
  const txHash = await provider.sendTransaction({
    to: USDC,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
  });
  await provider.waitForTransactionReceipt(txHash);
  recentPayouts().push({ to, amount: amountUsdc, at: Date.now() });
  return { txHash, explorerUrl: `${CHAIN.explorer}/tx/${txHash}`, to, amount: String(amountUsdc) };
}
