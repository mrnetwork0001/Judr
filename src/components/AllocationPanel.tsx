"use client";

import { useState } from "react";
import { Glyph } from "./Glyphs";
import type { Vault } from "@/lib/vault";

interface AllocateResponse {
  outcome: "allocated" | "held" | "cash" | "refused";
  decision: { allocate: boolean; vault_id: string; rationale: string; expected_hold_days: number; risks: string[] };
  check: { accepted: boolean; reasons: string[] };
  record: { model: string; startedAt: number; endedAt: number; repairs: number };
  snapshot: { source: "live" | "recorded"; fetchedAt: number; count: number };
  vault: Vault;
  error?: string;
}

/**
 * Where the escrow sits, and the agent that decides it. The escrow is parked
 * in an IXS vault while the dispute is open; the SERV step can be asked to
 * re-evaluate against the live vault list, and its proposal only takes
 * effect if the deterministic policy accepts it.
 */
export default function AllocationPanel({
  vault,
  onVault,
  disabled,
}: {
  vault: Vault;
  onVault: (v: Vault) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<AllocateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const evaluate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/allocate", { method: "POST" });
      const data = (await res.json()) as AllocateResponse;
      if (!res.ok) throw new Error(data.error ?? `allocation failed (${res.status})`);
      setLast(data);
      onVault(data.vault);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const a = vault.allocation;
  const canMove = vault.status === "funded" || vault.status === "disputed";

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Escrow allocation</h2>
        {a ? <span className="badge live">agent decision · not executed</span> : <span className="badge">cash</span>}
      </div>

      <div className="panel-body">
        {a ? (
          <>
            <div className="alloc-name">
              {a.name} <span className="mono">{a.symbol}</span>
            </div>
            <div className="alloc-meta">
              <span>{a.chainName}</span>
              <span>{(a.rate * 100).toFixed(2)}% TTM yield</span>
              {a.sharePrice && <span>share price {a.sharePrice}</span>}
              <span>
                since{" "}
                {new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
            <p className="alloc-why">{a.rationale}</p>
            <div className="alloc-tx">
              <span className="k">unsigned request · chain {a.tx.chainId}</span>
              <code>
                {a.tx.functionName}({a.tx.args.join(", ")}) → {a.tx.address}
              </code>
              <a href={`${a.explorerUrl}/address/${a.contractAddress}`} target="_blank" rel="noreferrer">
                vault on explorer <Glyph name="external" className="gi" />
              </a>
            </div>
          </>
        ) : (
          <p className="alloc-why">
            The escrow is held as USDC in the agent&rsquo;s wallet. Ask the agent where it should sit: it reads IXS&rsquo;s live vault list and proposes a vault or cash, and the policy decides. Per-case deposits are not sent: the vault takes 100 USDC minimum and IXS finalises requests in hours to days, so the agent keeps one standing position in the Avalanche vault instead, and its live state is shown below.
          </p>
        )}

        <div className="controls" style={{ marginTop: 14 }}>
          <button className="btn small" onClick={() => void evaluate()} disabled={busy || disabled || !canMove}>
            {busy ? "Asking the agent…" : "Re-evaluate with the agent"}
          </button>
          {!canMove && <span className="badge">locked once a verdict is posted</span>}
        </div>

        {error && (
          <div className="error-bar" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        {last && (
          <div className="alloc-result">
            <div className="alloc-result-head">
              <span className={`badge ${last.outcome === "refused" ? "alert" : last.outcome === "cash" ? "warn" : "ok"}`}>
                {last.outcome === "allocated"
                  ? "moved · accepted by policy"
                  : last.outcome === "held"
                    ? "hold · accepted by policy"
                    : last.outcome === "cash"
                      ? "hold cash"
                      : "refused by policy"}
              </span>
              <span className="badge">{last.record.model}</span>
              <span className="badge">{last.snapshot.count} vaults · {last.snapshot.source} read</span>
            </div>
            <p className="alloc-why">{last.decision.rationale}</p>
            {last.decision.risks.length > 0 && (
              <ul className="alloc-risks">
                {last.decision.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {!last.check.accepted && (
              <div className="error-bar">
                {last.check.reasons.map((r) => (
                  <div key={r}>{r}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
