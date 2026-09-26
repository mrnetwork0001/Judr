"use client";

import { useState, useSyncExternalStore } from "react";
import type { Vault } from "@/lib/vault";
import type { Role } from "@/lib/identity";
import type { ChainInfo } from "@/lib/identity";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

const ROLE_LABEL: Record<Role, string> = {
  plaintiff: "Contractor (plaintiff)",
  defendant: "Client (defendant)",
  reviewer: "Reviewer",
};

/*
 * Connect a wallet and join the case in a role. The wallet signs a message
 * naming the vault, the role and the session; the server verifies it. This is
 * identity, not custody: the button never asks for a transaction.
 */
export default function WalletConnect({
  vault,
  onVault,
  chain,
  compact = false,
}: {
  vault: Vault;
  onVault: (v: Vault) => void;
  /** The escrow agent's chain; the wallet is asked to switch to it. */
  chain: ChainInfo;
  compact?: boolean;
}) {
  const CHAIN = chain;
  // Server snapshot is "no wallet"; the client reads the injected provider.
  const available = useSyncExternalStore(
    () => () => {},
    () => typeof window !== "undefined" && !!window.ethereum,
    () => false,
  );
  const [address, setAddress] = useState<string | null>(null);
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role>("plaintiff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = vault.participants?.find((p) => p.address.toLowerCase() === address?.toLowerCase());

  const connect = async () => {
    if (!window.ethereum) return;
    setBusy(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chain = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] ?? null);
      setChainOk(chain.toLowerCase() === CHAIN.hex);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const switchChain = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.hex }] });
      setChainOk(true);
    } catch {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: CHAIN.hex, chainName: CHAIN.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"], blockExplorerUrls: [CHAIN.explorer] }],
        });
        setChainOk(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const join = async () => {
    if (!window.ethereum || !address) return;
    setBusy(true);
    setError(null);
    try {
      const prep = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join-message", role, address }),
      });
      const { message, error: prepError } = (await prep.json()) as { message?: string; error?: string };
      if (!prep.ok || !message) throw new Error(prepError ?? "could not prepare the message");
      const signature = (await window.ethereum.request({ method: "personal_sign", params: [message, address] })) as string;
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", role, address, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "join failed");
      onVault(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  if (!available) {
    return compact ? null : (
      <div className="wallet">
        <span className="badge">no wallet detected</span>
        <p>Install a browser wallet (MetaMask, Coinbase Wallet) to join the case as a party. Payouts go to the winner&rsquo;s proven address.</p>
      </div>
    );
  }

  if (me) {
    return (
      <div className="wallet">
        <span className="badge ok"><span className="dot" /> {ROLE_LABEL[me.role]}</span>
        <p className="mono">{short(me.address)}</p>
        {!compact && <p>Proven by signature. Appeals are accepted only from the losing party&rsquo;s address; the payout goes to the winner&rsquo;s.</p>}
      </div>
    );
  }

  return (
    <div className="wallet">
      {!address ? (
        <>
          <button className="btn small" onClick={() => void connect()} disabled={busy}>
            {busy ? "Connecting…" : "Connect wallet"}
          </button>
          {!compact && <p>Join the case as a party. The wallet signs a message; it never sends a transaction.</p>}
        </>
      ) : (
        <>
          <p className="mono">{short(address)}</p>
          {chainOk === false && (
            <button className="btn small" onClick={() => void switchChain()}>Switch to {CHAIN.name}</button>
          )}
          <select className="wallet-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={busy}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <button className="btn primary small" onClick={() => void join()} disabled={busy}>
            {busy ? "Signing…" : "Sign to join"}
          </button>
        </>
      )}
      {error && <div className="error-bar" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
