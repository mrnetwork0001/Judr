/**
 * IXS vaults.
 *
 * Two sources, both public and unauthenticated: the IXS REST API for the vault
 * list and its reported yield, and — for the vault their SDK knows — a direct
 * on-chain read of totals over Avalanche's public RPC. Transactions are built
 * with IXS's own @ixswap1/vault-agent-sdk, which returns unsigned call data
 * and stops there; Judr holds no key and signs nothing. That is the SDK's
 * design and it is the honest boundary of this integration.
 *
 * If the API is unreachable the last recorded snapshot is served, labelled as
 * such. A demo must not fail because a third party's API is having a bad day,
 * and a viewer must never mistake a snapshot for a live read.
 */

import { createPublicClient, http, type Address } from "viem";
import { avalanche } from "viem/chains";
import {
  KNOWN_VAULTS,
  buildRequestDepositTx,
  buildRequestRedeemTx,
  readVaultState,
} from "@ixswap1/vault-agent-sdk";
import { sharePrice } from "./yield";

const API = "https://api-v2.ixs.finance";
const CACHE_MS = 10 * 60 * 1000;

export interface IxsVaultSummary {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  chainName: string;
  contractAddress: Address;
  explorerUrl: string;
  /** No whitelist: an agent wallet can subscribe without KYC on the vault side. */
  permissionless: boolean;
  status: string;
  /** Trailing-twelve-month yield as a fraction, as IXS reports it (3.07% → 0.0307). */
  ttmRate: number;
  asset: { symbol: string; decimals: number; address: Address };
  /** Live totals for vaults readable on-chain from here. Strings: this crosses JSON. */
  onchain?: {
    totalAssets: string;
    totalSupply: string;
    shareDecimals: number;
    sharePrice: number;
    tvl: number;
  };
}

export interface IxsSnapshot {
  vaults: IxsVaultSummary[];
  fetchedAt: number;
  source: "live" | "recorded";
}

/* ---------------------------------------------------------------- */
/* Recorded snapshot — the live read of 2026-09-26, for when the API  */
/* is down. Served with source: "recorded".                          */
/* ---------------------------------------------------------------- */

const RECORDED: IxsVaultSummary[] = [
  {
    id: "6a952729732c2b84b55ce89d",
    name: "IX High Yield Bond (USDC)",
    symbol: "IXHYB",
    chainId: 43114,
    chainName: "Avalanche C-Chain",
    contractAddress: "0xaD01573b459805E3954398796203d830B57A8bD9",
    explorerUrl: "https://snowscan.xyz",
    permissionless: true,
    status: "active",
    ttmRate: 0.0307,
    asset: { symbol: "USDC", decimals: 6, address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    onchain: {
      totalAssets: "402614429",
      totalSupply: "369293789548844955716",
      shareDecimals: 18,
      sharePrice: 1.0902,
      tvl: 402.61,
    },
  },
  {
    id: "6a26624ca7d16b245d665475",
    name: "IX High Yield Bond (USDC)",
    symbol: "ixv1",
    chainId: 56,
    chainName: "BNB Smart Chain",
    contractAddress: "0xc975a3EeF2e49F8eDdEf585340C43f15300fCB82",
    explorerUrl: "https://bscscan.com",
    permissionless: true,
    status: "active",
    ttmRate: 0.0307,
    asset: { symbol: "USDC", decimals: 18, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
  },
  {
    id: "6a9a59c6ef910c9d0495e7e3",
    name: "IX High Yield Bond (USDC)",
    symbol: "IXHYB",
    chainId: 43114,
    chainName: "Avalanche C-Chain",
    contractAddress: "0x864E9C192a724773C2bB8C1e84572996074F0B41",
    explorerUrl: "https://snowscan.xyz",
    permissionless: false,
    status: "active",
    ttmRate: 0.0307,
    asset: { symbol: "USDC", decimals: 6, address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
  },
  {
    id: "6a8ecb61732c2b84b55ce88f",
    name: "IX High Yield Bond (USDC)",
    symbol: "ix7540v1",
    chainId: 56,
    chainName: "BNB Smart Chain",
    contractAddress: "0xD84129f506d1030Dd6b46Fe4A600d1E1c3b0802E",
    explorerUrl: "https://bscscan.com",
    permissionless: false,
    status: "active",
    ttmRate: 0.0307,
    asset: { symbol: "USDC", decimals: 18, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
  },
];

export const RECORDED_SNAPSHOT: IxsSnapshot = {
  vaults: RECORDED,
  fetchedAt: Date.parse("2026-09-26T12:00:00Z"),
  source: "recorded",
};

/* ---------------------------------------------------------------- */
/* Live reads                                                        */
/* ---------------------------------------------------------------- */

interface ApiVault {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  chainName: string;
  contractAddress: string;
  explorerUrl: string;
  requiresWhitelist: boolean;
  status: string;
  ttm: number | null;
  underlyingAsset: { symbol: string; decimals: number; address: string };
}

function fromApi(v: ApiVault): IxsVaultSummary {
  return {
    id: v.id,
    name: v.name,
    symbol: v.symbol,
    chainId: v.chainId,
    chainName: v.chainName,
    contractAddress: v.contractAddress as Address,
    explorerUrl: v.explorerUrl,
    permissionless: !v.requiresWhitelist,
    status: v.status,
    ttmRate: (v.ttm ?? 0) / 100,
    asset: {
      symbol: v.underlyingAsset.symbol,
      decimals: v.underlyingAsset.decimals,
      address: v.underlyingAsset.address as Address,
    },
  };
}

/** The one vault the SDK's registry knows; its totals are read on-chain. */
const ONCHAIN_VAULT = KNOWN_VAULTS["avax-ixhyb"];

async function readOnchain(vault: IxsVaultSummary): Promise<IxsVaultSummary["onchain"] | undefined> {
  if (vault.contractAddress.toLowerCase() !== ONCHAIN_VAULT.address.toLowerCase()) return undefined;
  try {
    const client = createPublicClient({ chain: avalanche, transport: http() });
    const state = await readVaultState(client, ONCHAIN_VAULT);
    if (state.totalAssets === null || state.totalSupply === null || state.decimals === null) return undefined;
    const price = sharePrice(state.totalAssets, vault.asset.decimals, state.totalSupply, state.decimals);
    return {
      totalAssets: state.totalAssets.toString(),
      totalSupply: state.totalSupply.toString(),
      shareDecimals: state.decimals,
      sharePrice: Number(price.toFixed(6)),
      tvl: Number((Number(state.totalAssets) / 10 ** vault.asset.decimals).toFixed(2)),
    };
  } catch {
    return undefined;
  }
}

const store = globalThis as unknown as { __judrIxs?: { at: number; snapshot: IxsSnapshot } };

export async function ixsVaults(opts: { fresh?: boolean } = {}): Promise<IxsSnapshot> {
  const cached = store.__judrIxs;
  if (!opts.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.snapshot;

  try {
    const res = await fetch(`${API}/vaults`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`IXS API ${res.status}`);
    const body = (await res.json()) as { items: ApiVault[] };
    const vaults = body.items.filter((v) => v.status === "active").map(fromApi);
    for (const v of vaults) {
      const onchain = await readOnchain(v);
      if (onchain) v.onchain = onchain;
    }
    // Permissionless first, then by chain, so the agent and the reader see the
    // same order and the actionable vaults lead.
    vaults.sort((a, b) => Number(b.permissionless) - Number(a.permissionless) || a.chainId - b.chainId);
    const snapshot: IxsSnapshot = { vaults, fetchedAt: Date.now(), source: "live" };
    store.__judrIxs = { at: Date.now(), snapshot };
    return snapshot;
  } catch {
    return RECORDED_SNAPSHOT;
  }
}

export function findVault(snapshot: IxsSnapshot, id: string): IxsVaultSummary | undefined {
  return snapshot.vaults.find((v) => v.id === id);
}

/* ---------------------------------------------------------------- */
/* Unsigned transactions                                             */
/* ---------------------------------------------------------------- */

/** Call data as it crosses JSON: args stringified, nothing signed. */
export interface UnsignedTx {
  chainId: number;
  address: string;
  functionName: string;
  args: string[];
}

function summarise(chainId: number, tx: { address: string; functionName: string; args: readonly unknown[] }): UnsignedTx {
  return {
    chainId,
    address: tx.address,
    functionName: tx.functionName,
    args: tx.args.map((a) => (typeof a === "bigint" ? a.toString() : String(a))),
  };
}

/**
 * ERC-7540 subscription request for the escrow. Built with IXS's SDK against
 * the vault the SDK knows; for the others the same shape is produced from
 * the vault's own address so the trail still shows what a signer would send.
 */
export function buildDeposit(vault: IxsVaultSummary, account: Address, amountHuman: string): UnsignedTx {
  const cfg = { ...ONCHAIN_VAULT, address: vault.contractAddress };
  return summarise(vault.chainId, buildRequestDepositTx(cfg, account, amountHuman, vault.asset.decimals));
}

export function buildRedeem(vault: IxsVaultSummary, account: Address, sharesHuman: string): UnsignedTx {
  const cfg = { ...ONCHAIN_VAULT, address: vault.contractAddress };
  const shareDecimals = vault.onchain?.shareDecimals ?? 18;
  return summarise(vault.chainId, buildRequestRedeemTx(cfg, account, sharesHuman, shareDecimals));
}

/** The address Judr's escrow agent would sign from. A placeholder until a signer exists. */
export const ESCROW_AGENT: Address = "0x00000000000000000000000000000000000001cd";

/**
 * The allocation the demo escrow starts with: placed into the permissionless
 * Avalanche vault on the day it was funded, at the rate IXS reported in the
 * recorded snapshot. Its call data is built by the SDK so the trail shows
 * exactly what a signer would have sent. Labelled recorded wherever shown.
 */
export const INITIAL_ALLOCATION_VAULT = RECORDED[0];
export const INITIAL_ALLOCATION_AT = Date.parse("2026-08-25T10:06:00Z");
export const INITIAL_DEPOSIT_TX = buildDeposit(INITIAL_ALLOCATION_VAULT, ESCROW_AGENT, "10000");
