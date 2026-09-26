"use client";

import type { Vault } from "@/lib/vault";
import type { ArbitrationResult } from "@/lib/types";

const STATUS_COPY: Record<Vault["status"], { label: string; tone: string }> = {
  funded: { label: "Funded · escrow held", tone: "" },
  disputed: { label: "Disputed", tone: "warn" },
  verdict_posted: { label: "Verdict posted", tone: "warn" },
  released: { label: "Released", tone: "ok" },
  appealed: { label: "Under appeal", tone: "alert" },
};

export default function VaultPanel({
  vault,
  result,
}: {
  vault: Vault;
  result: ArbitrationResult | null;
}) {
  const status = STATUS_COPY[vault.status];
  // Who the escrow went (or is going) to: a review can overturn the verdict.
  const winner = vault.releasedTo
    ? vault.releasedTo.name === vault.plaintiff.name
      ? "plaintiff"
      : "defendant"
    : result?.verdict.winner;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>IXS Vault</h2>
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </div>

      <div className="panel-body">
        <div className="vault-amount">
          {vault.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          <span>{vault.asset}</span>
        </div>
        <div className="vault-sub">
          {vault.id} · {vault.contractTitle}
        </div>

        <div style={{ marginTop: 16 }}>
          <div className={`party-row ${winner === "plaintiff" ? "winner" : ""}`}>
            <div className="who">
              <div className="name">{vault.plaintiff.name}</div>
              <div className="addr">{vault.plaintiff.address ?? "no wallet signed in"}</div>
            </div>
            <div className="role">
              {winner === "plaintiff" ? "awarded" : "plaintiff"}
            </div>
          </div>
          <div className={`party-row ${winner === "defendant" ? "winner" : ""}`}>
            <div className="who">
              <div className="name">{vault.defendant.name}</div>
              <div className="addr">{vault.defendant.address ?? "no wallet signed in"}</div>
            </div>
            <div className="role">
              {winner === "defendant" ? "awarded" : "defendant"}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-head" style={{ borderTop: "1px solid var(--border)" }}>
        <h2>Vault log</h2>
      </div>
      <div className="panel-body">
        <ul className="timeline">
          {vault.events.map((event, i) => (
            <li key={`${event.at}-${i}`}>
              <span className="pip" />
              <span>
                <span className="label">{event.label}</span>
                {event.detail && <div className="detail">{event.detail}</div>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
