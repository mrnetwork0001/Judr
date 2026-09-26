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
          <div className={`v ${confidence.consensus.failed > 0 ? "warn" : ""}`}>
            {confidence.consensus.agreed}/{confidence.consensus.runs}
          </div>
          <div className="n">
            {confidence.consensus.failed > 0
              ? `independent runs agreed · ${confidence.consensus.failed} failed to run`
              : confidence.consensus.winners
                ? confidence.consensus.winners.join(" · ")
                : "independent runs agreed"}
          </div>
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

      <div className="cost-strip">
        {result.cost.mode === "live" ? (
          <>
            <div className="cost-main">
              <span className="cost-k">This decision</span>
              <span className="cost-v">${result.cost.usd.toFixed(2)}</span>
              <span className="cost-sep">·</span>
              <span className="cost-v">{result.cost.seconds}s</span>
              <span className="cost-n">
                {(result.cost.promptTokens + result.cost.completionTokens).toLocaleString("en-US")} tokens · {result.cost.model}
              </span>
            </div>
            <div className="cost-vs">
              <span className="cost-k">A human arbitrator</span>
              <span className="cost-v dim">$3,000+</span>
              <span className="cost-sep">·</span>
              <span className="cost-v dim">6–12 weeks</span>
            </div>
          </>
        ) : (
          <div className="cost-main">
            <span className="cost-k">Recorded run</span>
            <span className="cost-n">no tokens spent · a live decision costs about $0.05 and under a minute</span>
          </div>
        )}
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
    const s = vault.settlement;
    return (
      <div className="settlement settlement-split">
        <div className="note">
          {s?.payoutTx ? (
            <>
              <strong>{s.display.payout} {vault.asset}</strong> paid on Base Sepolia to {vault.releasedTo?.name} —{" "}
              <span className="mono">{vault.releasedTo?.address}</span>.{" "}
              <a href={s.payoutUrl} target="_blank" rel="noreferrer">View the transaction ↗</a>
            </>
          ) : (
            <>Escrow released to {vault.releasedTo?.name}.</>
          )}
          {s && (
            <dl className="ledger">
              <dt>Principal</dt>
              <dd>{s.display.principal}</dd>
              {vault.allocation && (
                <>
                  <dt>Projected yield · {s.days} days at {(vault.allocation.rate * 100).toFixed(2)}% in {vault.allocation.symbol} — not executed</dt>
                  <dd>({s.display.projectedYield})</dd>
                </>
              )}
              <dt>Judr fee · from yield only</dt>
              <dd>− {s.display.fee}</dd>
              <dt className="total">Paid to {vault.releasedTo?.name}</dt>
              <dd className="total">{s.display.payout} {vault.asset}</dd>
            </dl>
          )}
          {s?.redeemTx && (
            <div className="alloc-tx">
              <span className="k">IXS redemption a signer would send · chain {s.redeemTx.chainId} · unsigned</span>
              <code>
                {s.redeemTx.functionName}({s.redeemTx.args.join(", ")}) → {s.redeemTx.address}
              </code>
            </div>
          )}
        </div>
        <span className="badge ok">
          <span className="dot" /> Settled on-chain
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
        <button className="btn danger small" onClick={onAppeal} disabled={busy || !windowOpen} title="Only the losing party's signed-in wallet can appeal">
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
