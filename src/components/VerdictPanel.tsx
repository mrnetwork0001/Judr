"use client";

import { useEffect, useState } from "react";
import type { ArbitrationResult, Clause } from "@/lib/types";
import type { Vault } from "@/lib/vault";

export default function VerdictPanel({
  result,
  vault,
  onAppeal,
  onRelease,
  busy,
}: {
  result: ArbitrationResult;
  vault: Vault;
  onAppeal: () => void;
  onRelease: () => void;
  busy: boolean;
}) {
  const { verdict, confidence, verification } = result;
  const winnerName =
    verdict.winner === "plaintiff"
      ? vault.plaintiff.name
      : vault.defendant.name;

  const clauseById = new Map<string, Clause>(
    result.clauses.clauses.map((c) => [c.id, c]),
  );

  const confidenceTone =
    confidence.score >= 0.85 ? "ok" : confidence.score >= 0.6 ? "warn" : "bad";

  return (
    <div className="panel verdict-panel">
      <div className="verdict-hero">
        <div className="eyebrow">Verdict</div>
        <div className="winner">{winnerName}</div>
        <div className="basis">{verdict.award_basis}</div>
      </div>

      <div className="confidence">
        <div className="conf-cell">
          <div className="k">Confidence</div>
          <div className={`v ${confidenceTone}`}>
            {(confidence.score * 100).toFixed(0)}%
          </div>
          <div className="meter">
            <i style={{ width: `${confidence.score * 100}%` }} />
          </div>
          <div className="n">stability × citations · never self-reported</div>
        </div>
        <div className="conf-cell">
          <div className="k">Decision stability</div>
          <div className="v">
            {confidence.consensus.agreed}/{confidence.consensus.runs}
          </div>
          <div className="n">independent runs agreed</div>
        </div>
        <div className="conf-cell">
          <div className="k">Clause support</div>
          <div className="v">{(confidence.clause_support * 100).toFixed(0)}%</div>
          <div className="n">decisive clauses with a finding</div>
        </div>
        <div className="conf-cell">
          <div className="k">Citations</div>
          <div className={`v ${verification.passed ? "ok" : "bad"}`}>
            {verification.passed ? "valid" : "failed"}
          </div>
          <div className="n">
            {verification.passed
              ? "every clause and document resolves"
              : `${verification.issues.length} issue(s)`}
          </div>
        </div>
      </div>

      {!verification.passed && (
        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <div className="error-bar">
            {verification.issues.map((issue, i) => (
              <div key={i}>{issue.detail}</div>
            ))}
          </div>
        </div>
      )}

      <div className="panel-body">
        <div className="rationale">
          {verdict.rationale.split(/\n\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        <div className="decisive">
          <span className="badge">Decisive</span>
          {verdict.decisive_clauses.map((id) => (
            <span key={id} className="badge warn">
              {id} · {clauseById.get(id)?.label ?? "unknown clause"}
            </span>
          ))}
        </div>
      </div>

      <Settlement
        vault={vault}
        onAppeal={onAppeal}
        onRelease={onRelease}
        busy={busy}
      />
    </div>
  );
}

function Settlement({
  vault,
  onAppeal,
  onRelease,
  busy,
}: {
  vault: Vault;
  onAppeal: () => void;
  onRelease: () => void;
  busy: boolean;
}) {
  const deadline = vault.verdict?.appealDeadline ?? 0;
  const remaining = useCountdown(deadline, vault.status === "verdict_posted");
  const windowOpen = vault.status === "verdict_posted" && remaining > 0;

  if (vault.status === "released") {
    return (
      <div className="settlement">
        <div className="note">
          Escrow released to {vault.releasedTo?.name} — {vault.releasedTo?.address}.
          The appeal window closed without challenge.
        </div>
        <span className="badge ok">
          <span className="dot" /> Settled
        </span>
      </div>
    );
  }

  if (vault.status === "appealed") {
    return (
      <div className="settlement">
        <div className="note">
          An appeal was lodged inside the window. Release is halted and the
          dispute is escalated to human review — Judr does not overrule an appeal.
        </div>
        <span className="badge alert">
          <span className="dot" /> Halted
        </span>
      </div>
    );
  }

  return (
    <div className="settlement">
      <div className="note">
        {windowOpen ? (
          <>
            Funds do not move yet. The losing party has{" "}
            <span className="countdown">{formatRemaining(remaining)}</span> to
            appeal. Release is refused by the vault until the window closes —
            the check lives with the funds, not with the caller.
          </>
        ) : (
          <>
            The appeal window has closed without challenge. The vault will now
            honour a release call against verdict digest{" "}
            <span className="mono">{vault.verdict?.digest.slice(0, 12)}…</span>
          </>
        )}
      </div>
      <div className="actions">
        <button className="btn danger small" onClick={onAppeal} disabled={busy || !windowOpen}>
          Lodge appeal
        </button>
        <button
          className="btn primary small"
          onClick={onRelease}
          disabled={busy || windowOpen}
        >
          {windowOpen ? `Release in ${formatRemaining(remaining)}` : "Release escrow"}
        </button>
      </div>
    </div>
  );
}

function useCountdown(deadline: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);

  return Math.max(0, deadline - now);
}

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
