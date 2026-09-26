"use client";

import { useState } from "react";
import type { Vault } from "@/lib/vault";

/*
 * What happens after an appeal. Judr stops; a person decides. The reviewer
 * upholds the verdict or overturns it, with a written reason that goes on the
 * vault's record, and the escrow settles to whoever they decide.
 */
export default function ReviewPanel({
  vault,
  onVault,
  disabled,
  by,
}: {
  vault: Vault;
  onVault: (v: Vault) => void;
  disabled: boolean;
  /** The connected wallet; must be signed in as the reviewer. */
  by: string | null;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (vault.status !== "appealed" && !vault.review) return null;

  const decide = async (decision: "uphold" | "overturn") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", decision, note, by }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "review failed");
      onVault(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (vault.review) {
    const r = vault.review;
    return (
      <div className="panel review-panel">
        <div className="panel-head">
          <h2>Human review</h2>
          <span className={`badge ${r.decision === "uphold" ? "ok" : "warn"}`}>
            {r.decision === "uphold" ? "verdict upheld" : "verdict overturned"}
          </span>
        </div>
        <div className="panel-body">
          <p className="review-note">&ldquo;{r.note}&rdquo;</p>
          <div className="review-meta">
            Escrow paid on-chain to <strong>{r.payee.name}</strong> ·{" "}
            {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel review-panel">
      <div className="panel-head">
        <h2>Human review</h2>
        <span className="badge alert">appeal pending</span>
      </div>
      <div className="panel-body">
        <p className="review-lead">
          Judr has stopped. The verdict for <strong>{vault.verdict?.payee.name}</strong> is
          frozen until a person decides. Sign in as the <strong>reviewer</strong> with a
          wallet, write the reason for your decision, and the escrow is paid on-chain to
          whoever you decide.
        </p>
        <textarea
          className="review-input"
          rows={3}
          placeholder="e.g. The acceptance-window finding is correct; the Client's notice is dated outside it."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy || disabled}
          maxLength={600}
        />
        <div className="controls" style={{ marginTop: 10 }}>
          <button className="btn primary small" onClick={() => void decide("uphold")} disabled={busy || disabled || !note.trim()}>
            Uphold verdict
          </button>
          <button className="btn danger small" onClick={() => void decide("overturn")} disabled={busy || disabled || !note.trim()}>
            Overturn · award the other party
          </button>
        </div>
        {error && (
          <div className="error-bar" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
