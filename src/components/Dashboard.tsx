"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { IxsSnapshot } from "@/lib/ixs";
import { accrue, formatMinor } from "@/lib/yield";
import AllocationPanel from "./AllocationPanel";
import CustomDispute from "./CustomDispute";
import ReviewPanel from "./ReviewPanel";
import VaultPanel from "./VaultPanel";
import WalletConnect from "./WalletConnect";
import type { EscrowStatus } from "@/lib/escrow";
import type { CustomDisputeInput } from "@/lib/custom";
import VerdictPanel from "./VerdictPanel";
import type {
  ArbitrationEvent,
  ArbitrationResult,
  Clause,
  ClauseFinding,
  DisputeBundle,
  Evaluation,
  GuardFlag,
  StepRecord,
} from "@/lib/types";
import type { Vault } from "@/lib/vault";

interface StepView {
  step: string;
  label: string;
  text: string;
  status: "running" | "done" | "failed";
  record?: StepRecord;
  repairs: { attempt: number; errors: string[] }[];
  startedAt: number;
}

export default function Dashboard({
  initialVault,
  dispute,
  poisonedDispute,
  liveCapable,
  escrow,
}: {
  initialVault: Vault;
  dispute: DisputeBundle;
  poisonedDispute: DisputeBundle;
  liveCapable: boolean;
  /** The escrow agent's real address and balances, read on the server. */
  escrow: EscrowStatus;
}) {
  const [vault, setVault] = useState<Vault>(initialVault);
  const [steps, setSteps] = useState<StepView[]>([]);
  const [flags, setFlags] = useState<GuardFlag[]>([]);
  const [result, setResult] = useState<ArbitrationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poisoned, setPoisoned] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The wallet this browser signed in with, learned from the join response.
  const [wallet, setWallet] = useState<string | null>(null);
  const onVaultWithWallet = (v: Vault) => {
    setVault(v);
    const last = v.participants[v.participants.length - 1];
    if (last) setWallet(last.address);
  };

  // The app is one screen of state with several pages over it. The page lives
  // in the URL hash so a view is linkable and the back button works, and a
  // run keeps going while the visitor looks elsewhere.
  const [page, setPage] = useState<Page>("overview");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "") as Page;
      setPage(PAGES.some((p) => p.id === h) ? h : "overview");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  // On phones the sidebar is a drawer. It closes on navigation, on Escape,
  // and when the viewport grows back to desktop, so it can never be stuck open.
  const [menuOpen, setMenuOpen] = useState(false);
  const go = useCallback((next: Page) => {
    window.location.hash = next;
    setPage(next);
    setMenuOpen(false);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const abortRef = useRef<AbortController | null>(null);
  // A visitor's own case, shown in the rail while it runs. Cleared on reset.
  const [customDisplay, setCustomDisplay] = useState<DisputeBundle | null>(null);
  const activeDispute = customDisplay ?? (poisoned ? poisonedDispute : dispute);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleEvent = useCallback((event: ArbitrationEvent) => {
    switch (event.type) {
      case "step_started": {
        if (event.step === "mode") return;
        setSteps((prev) => [
          ...prev,
          {
            step: event.step,
            label: event.label,
            text: "",
            status: "running",
            repairs: [],
            startedAt: event.at,
          },
        ]);
        setOpen((prev) => ({ ...prev, [event.step]: true }));
        return;
      }
      case "step_delta": {
        setSteps((prev) =>
          prev.map((s) => (s.step === event.step ? { ...s, text: s.text + event.text } : s)),
        );
        return;
      }
      case "step_repair": {
        setSteps((prev) =>
          prev.map((s) =>
            s.step === event.step
              ? { ...s, repairs: [...s.repairs, { attempt: event.attempt, errors: event.errors }] }
              : s,
          ),
        );
        return;
      }
      case "step_done": {
        setSteps((prev) =>
          prev.map((s) =>
            s.step === event.step ? { ...s, status: "done", record: event.record } : s,
          ),
        );
        // Collapse finished steps so the feed stays readable as it grows.
        setOpen((prev) => ({ ...prev, [event.step]: false }));
        return;
      }
      case "guard_flag": {
        setFlags((prev) => [...prev, event.flag]);
        return;
      }
      case "run_done": {
        setResult(event.result);
        return;
      }
      case "run_failed": {
        setError(`${event.step}: ${event.error}`);
        setSteps((prev) =>
          prev.map((s) => (s.step === event.step ? { ...s, status: "failed" } : s)),
        );
        return;
      }
    }
  }, []);

  const run = useCallback(async (poisonedOverride?: boolean, custom?: CustomDisputeInput) => {
    const usePoisoned = poisonedOverride ?? poisoned;
    abortRef.current?.abort();
    setCustomDisplay(custom ? displayBundle(custom, vault.id) : null);
    const controller = new AbortController();
    abortRef.current = controller;

    setSteps([]);
    setFlags([]);
    setResult(null);
    setError(null);
    setRunning(true);

    try {
      await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });

      const response = await fetch("/api/arbitrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(custom ? { custom } : { poisoned: usePoisoned }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Arbitration request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split: number;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              handleEvent(JSON.parse(line.slice(5).trim()) as ArbitrationEvent);
            } catch {
              // Ignore a partial frame; the next read completes it.
            }
          }
        }
      }

      const fresh = await fetch("/api/vault", { cache: "no-store" });
      setVault(await fresh.json());
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }, [handleEvent, poisoned, vault.id]);

  // ?autorun=1 starts the run on load, ?poisoned=1 preloads the tampered
  // bundle. Both exist so a demo recording can be captured hands-free.
  //
  // The guard is set synchronously and there is no cleanup on purpose: under
  // StrictMode this effect runs twice, so clearing the timer on teardown would
  // cancel the only scheduled run.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const wantsRun = params.get("autorun") === "1";
    const wantsPoison = params.get("poisoned") === "1";
    if (!wantsRun && !wantsPoison) return;

    autoStarted.current = true;
    setTimeout(() => {
      if (wantsRun) go("dispute");
      setPoisoned(wantsPoison);
      // Passed explicitly: the state set above is not yet visible to run()'s
      // closure.
      if (wantsRun) void run(wantsPoison);
    }, 400);
  }, [run, go]);

  const vaultAction = useCallback(async (action: "appeal" | "release" | "reset") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: "The losing party disputes the decisive finding",
          by: wallet,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Vault rejected the call");
      setVault(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallet]);

  const reset = useCallback(async () => {
    abortRef.current?.abort();
    setSteps([]);
    setFlags([]);
    setResult(null);
    setError(null);
    setCustomDisplay(null);
    await vaultAction("reset");
  }, [vaultAction]);

  const quarantined = useMemo(
    () => new Set(flags.filter((f) => f.severity === "high").map((f) => f.evidence_id)),
    [flags],
  );

  const quarantinedCount = quarantined.size;
  // Read once at mount: accrual is counted in whole days, so a stale "now" is
  // fine and keeps render pure.
  const [mountedAt] = useState(() => Date.now());
  const accrued = useMemo(() => {
    if (!vault.allocation) return null;
    const opened = vault.funding?.at ?? vault.events[0]?.at ?? mountedAt;
    const days = Math.max(0, Math.floor((mountedAt - opened) / 86_400_000));
    const principal = BigInt(Math.round(vault.amount * 1_000_000));
    return { days, amount: formatMinor(accrue(principal, vault.allocation.rate, days), 6) };
  }, [vault.allocation, vault.amount, vault.funding, vault.events, mountedAt]);

  const runDisputeFromAnywhere = () => {
    go("dispute");
    void run();
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link href="/" className="wordmark-app">
          <span className="mark">⚖</span> Judr
        </Link>
        <span className="app-topbar-page">{PAGES.find((p) => p.id === page)?.label}</span>
        <button
          type="button"
          className="menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="app-drawer"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {menuOpen && <div className="app-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside id="app-drawer" className={`app-side ${menuOpen ? "open" : ""}`}>
        <div className="app-brand">
          <Link href="/" className="wordmark-app">
            <span className="mark">⚖</span> Judr
          </Link>
          <div className="app-tagline">Arbitration for escrowed RWAs</div>
          <button type="button" className="drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M12 4 6 10l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <nav className="app-nav" aria-label="App">
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`app-nav-item ${page === p.id ? "on" : ""}`}
              onClick={() => go(p.id)}
              aria-current={page === p.id ? "page" : undefined}
            >
              <span className="app-nav-icon" aria-hidden="true">{p.icon}</span>
              <span>{p.label}</span>
              {p.id === "dispute" && running && <span className="dot pulse app-nav-dot" />}
              {p.id === "evidence" && quarantinedCount > 0 && (
                <span className="app-nav-count alert">{quarantinedCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="app-side-card">
          <div className="status-row">
            <span className="status-k">Wallet</span>
            <WalletConnect vault={vault} onVault={onVaultWithWallet} chain={escrow.chain} compact />
          </div>
          <div className="status-row">
            <span className="status-k">Escrow agent</span>
            {escrow.address ? (
              <a className="status-v mono" href={`${escrow.explorer}/address/${escrow.address}`} target="_blank" rel="noreferrer">
                {escrow.address.slice(0, 6)}…{escrow.address.slice(-4)}
              </a>
            ) : (
              <span className="status-v bad">not configured</span>
            )}
            <span className="status-n">
              {escrow.error
                ? escrow.error
                : escrow.address
                  ? `${escrow.chain.name}${escrow.usdc !== undefined ? ` · ${Number(escrow.usdc).toFixed(2)} USDC held` : ""}`
                  : "set the CDP keys to pay out"}
            </span>
          </div>
          <div className="status-row">
            <span className="status-k">Reasoning</span>
            <span className={`status-v ${liveCapable ? "ok" : "bad"}`}>
              <span className={`dot ${running ? "pulse" : ""}`} /> {liveCapable ? "Live · SERV" : "No SERV key"}
            </span>
          </div>
          <button className="btn small block" onClick={reset} disabled={running || busy}>
            Reset case
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-head">
          <div>
            <h1>{PAGES.find((p) => p.id === page)?.title}</h1>
            <p>{PAGES.find((p) => p.id === page)?.subtitle}</p>
          </div>
          {page !== "custom" && (
            <div className="app-head-actions">
              <button className="btn primary" onClick={runDisputeFromAnywhere} disabled={running}>
                {running ? "Arbitrating…" : vault.status === "funded" ? "Run arbitration" : "New dispute · run again"}
              </button>
            </div>
          )}
        </header>

        {error && <div className="error-bar">{error}</div>}

        {page === "overview" && (
          <>
            <div className="tiles">
              <StatTile
                label="Escrow"
                value={`${vault.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                unit={vault.asset}
                caption={vault.funding ? `held by the agent on ${escrow.chain.name} · ${STATUS_LABEL[vault.status]}` : `${vault.id} · ${STATUS_LABEL[vault.status]}`}
              />
              <StatTile
                label="Projected yield"
                value={vault.allocation ? `+${accrued?.amount ?? "0.00"}` : "-"}
                unit={vault.allocation ? vault.asset : undefined}
                caption={
                  vault.allocation
                    ? `${vault.allocation.symbol} · ${(vault.allocation.rate * 100).toFixed(2)}% TTM · ${accrued?.days ?? 0} days · not executed`
                    : "agent has not been asked yet"
                }
              />
              <StatTile
                label="Verdict"
                value={
                  result
                    ? result.verdict.winner === "plaintiff"
                      ? activeDispute.plaintiff.name.split(" (")[0]
                      : activeDispute.defendant.name.split(" (")[0]
                    : "-"
                }
                caption={
                  result
                    ? `${(result.confidence.score * 100).toFixed(0)}% confidence · ${result.confidence.consensus.agreed}/${result.confidence.consensus.runs} stable`
                    : running
                      ? "arbitrating…"
                      : "no decision yet"
                }
                tone={result ? "ok" : undefined}
              />
              <StatTile
                label="Cost of decision"
                value={result ? (result.cost.mode === "live" ? `$${result.cost.usd.toFixed(2)}` : "$0.00") : "-"}
                caption={
                  result
                    ? result.cost.mode === "live"
                      ? `${result.cost.seconds}s · ${(result.cost.promptTokens + result.cost.completionTokens).toLocaleString("en-US")} tokens`
                      : "recorded run · no tokens"
                    : "a human arbitrator: $3,000+ · weeks"
                }
              />
            </div>

            <div className="app-grid-2">
              <VaultPanel vault={vault} result={result} />
              <div className="panel">
                <div className="panel-head"><h2>Walk-through</h2></div>
                <div className="panel-body">
                  <ol className="walk">
                    <li>
                      <strong>Run arbitration.</strong> Seven typed steps stream in on the Dispute page and end in a verdict with its price.
                      <button className="link" onClick={runDisputeFromAnywhere} disabled={running}>Run →</button>
                    </li>
                    <li>
                      <strong>Try tampered evidence.</strong> A document with a hidden instruction is caught and quarantined before anything reads it.
                      <button className="link" onClick={() => { setPoisoned(true); go("dispute"); }} disabled={running}>Set it up →</button>
                    </li>
                    <li>
                      <strong>Sign in with a wallet.</strong> Join as the Client to appeal, as the Reviewer to decide, as the Contractor to be paid - real USDC on {escrow.chain.name}.
                    </li>
                    <li>
                      <strong>Appeal, then review.</strong> An appeal freezes the escrow; the reviewer upholds or overturns on the record and the payout goes on-chain.
                    </li>
                    <li>
                      <strong>Bring your own case.</strong> Paste a contract and evidence and get a live decision.
                      <button className="link" onClick={() => go("custom")}>Open →</button>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </>
        )}

        {page === "dispute" && (
          <>
            <div className="panel">
              <div className="panel-head">
                <h2>{activeDispute.contract.title}</h2>
                <span className="badge">{activeDispute.vaultId}</span>
              </div>
              <div className="panel-body">
                <p style={{ margin: "0 0 16px", color: "var(--text-dim)", maxWidth: "76ch" }}>{activeDispute.claim}</p>
                <div className="controls">
                  <label className="toggle">
                    <input type="checkbox" checked={poisoned} onChange={(e) => setPoisoned(e.target.checked)} disabled={running || !!customDisplay} />
                    Include tampered evidence
                  </label>
                  {poisoned && !customDisplay && <span className="badge alert">e7 contains an injected instruction</span>}
                  {customDisplay && <span className="badge">your own case</span>}
                </div>
              </div>
            </div>

            {flags.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h2>Evidence screening</h2>
                  <span className="badge alert">{flags.length} flagged</span>
                </div>
                <div className="panel-body">
                  {flags.map((flag, i) => (
                    <div key={`${flag.evidence_id}-${i}`} className="guard-flag">
                      <div className="gf-head">
                        <span className="gf-kind">{flag.kind.replace(/_/g, " ")}</span>
                        <span className="badge alert">{flag.severity}</span>
                        <span className="badge">{flag.evidence_id}</span>
                        {flag.severity === "high" && <span className="badge alert">excluded from adjudication</span>}
                      </div>
                      <div className="gf-detail">{flag.detail}</div>
                      <blockquote>{flag.excerpt}</blockquote>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Feed steps={steps} open={open} setOpen={setOpen} clauses={result?.clauses.clauses ?? []} />

            {result && (
              <>
                <VerdictPanel result={result} vault={vault} busy={busy} onAppeal={() => vaultAction("appeal")} onRelease={() => vaultAction("release")} />
                <div className="panel">
                  <div className="panel-head"><h2>Who you are</h2><span className="badge">{vault.participants.length} signed in</span></div>
                  <div className="panel-body">
                    <WalletConnect vault={vault} onVault={onVaultWithWallet} chain={escrow.chain} />
                  </div>
                </div>
                <ReviewPanel vault={vault} onVault={onVaultWithWallet} disabled={running || busy} by={wallet} />
              </>
            )}
          </>
        )}

        {page === "evidence" && (
          <>
            <div className="panel">
              <div className="panel-head">
                <h2>Documents</h2>
                <span className="badge">{activeDispute.evidence.length} submitted{quarantinedCount ? ` · ${quarantinedCount} quarantined` : ""}</span>
              </div>
              <div className="panel-body docs">
                {activeDispute.evidence.map((doc) => (
                  <details key={doc.id} className={`doc ${quarantined.has(doc.id) ? "quarantined" : ""}`}>
                    <summary>
                      <span className="eid">{doc.id}</span>
                      <span className="fname">{doc.filename}</span>
                      <span className="side">
                        {doc.party === "plaintiff" ? activeDispute.plaintiff.name : activeDispute.defendant.name}
                        {quarantined.has(doc.id) && " · quarantined"}
                      </span>
                    </summary>
                    <pre className="doc-text">{doc.text}</pre>
                  </details>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h2>Contract</h2><span className="badge">{activeDispute.contract.id}</span></div>
              <div className="panel-body"><pre className="doc-text">{activeDispute.contract.text}</pre></div>
            </div>
            {flags.length > 0 && (
              <div className="panel">
                <div className="panel-head"><h2>Screening flags</h2><span className="badge alert">{flags.length}</span></div>
                <div className="panel-body">
                  {flags.map((flag, i) => (
                    <div key={`${flag.evidence_id}-${i}`} className="guard-flag">
                      <div className="gf-head">
                        <span className="gf-kind">{flag.kind.replace(/_/g, " ")}</span>
                        <span className="badge alert">{flag.severity}</span>
                        <span className="badge">{flag.evidence_id}</span>
                      </div>
                      <div className="gf-detail">{flag.detail}</div>
                      <blockquote>{flag.excerpt}</blockquote>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {page === "escrow" && (
          <div className="app-grid-2">
            <div className="app-col">
              <AllocationPanel vault={vault} onVault={setVault} disabled={running || busy} />
              {vault.settlement && (
                <div className="panel">
                  <div className="panel-head"><h2>Settlement</h2><span className="badge ok">released</span></div>
                  <div className="panel-body">
                    <dl className="ledger">
                      <dt>Principal</dt><dd>{vault.settlement.display.principal}</dd>
                      <dt>Yield · {vault.settlement.days} days</dt><dd>+ {vault.settlement.display.yieldEarned}</dd>
                      <dt>Judr fee · from yield only</dt><dd>− {vault.settlement.display.fee}</dd>
                      <dt className="total">Paid to {vault.releasedTo?.name}</dt><dd className="total">{vault.settlement.display.payout} {vault.asset}</dd>
                    </dl>
                  </div>
                </div>
              )}
            </div>
            <IxsVaultsPanel />
          </div>
        )}

        {page === "audit" && (
          result ? (
            <>
              <div className="tiles">
                <StatTile label="Steps recorded" value={String(result.trail.length)} caption="each with engine, schema result and input digest" />
                <StatTile label="Schema repairs" value={String(result.trail.reduce((n, r) => n + r.repairs, 0))} caption="invalid output re-prompted with the validator's errors" />
                <StatTile label="Tokens" value={(result.cost.promptTokens + result.cost.completionTokens).toLocaleString("en-US")} caption={result.cost.mode === "live" ? result.cost.model : "recorded run"} />
                <StatTile label="Verified" value={result.verification.passed ? "yes" : "no"} caption={result.verification.passed ? "every cited clause and document resolves" : `${result.verification.issues.length} issue(s)`} tone={result.verification.passed ? "ok" : "bad"} />
              </div>
              <AuditTrail result={result} />
            </>
          ) : (
            <div className="panel"><div className="feed-empty">Run an arbitration to produce a trail. Every step is recorded with its engine, schema result and input digest.</div></div>
          )
        )}

        {page === "custom" && (
          <CustomDispute
            embedded
            onRun={(input) => { go("dispute"); void run(false, input); }}
            disabled={running || busy}
            liveCapable={liveCapable}
          />
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Feed({
  steps,
  open,
  setOpen,
  clauses,
}: {
  steps: StepView[];
  open: Record<string, boolean>;
  setOpen: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  clauses: Clause[];
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Arbitration feed</h2>
        <span className="badge">{steps.filter((s) => s.status === "done").length} / {steps.length} steps</span>
      </div>
      <div className="feed">
        {steps.length === 0 && (
          <div className="feed-empty">
            The reasoning graph runs here. Each step is typed, schema-validated
            and recorded before the next one may consume it.
          </div>
        )}
        {steps.map((step, i) => (
          <StepCard
            key={`${step.step}-${step.startedAt}`}
            index={i + 1}
            step={step}
            open={open[step.step] ?? false}
            onToggle={() =>
              setOpen((prev) => ({ ...prev, [step.step]: !prev[step.step] }))
            }
            clauses={clauses}
          />
        ))}
      </div>
    </div>
  );
}

function StepCard({
  index,
  step,
  open,
  onToggle,
  clauses,
}: {
  index: number;
  step: StepView;
  open: boolean;
  onToggle: () => void;
  clauses: Clause[];
}) {
  const bodyRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [step.text]);

  const duration = step.record
    ? `${((step.record.endedAt - step.record.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <section className={`step ${step.status}`}>
      <button className="step-head" onClick={onToggle}>
        <span className="step-num">{String(index).padStart(2, "0")}</span>
        <span className="step-label">{step.label}</span>
        <span className="step-status">
          {step.status === "running" && "running…"}
          {step.status === "done" && `✓ ${duration}`}
          {step.status === "failed" && "failed"}
        </span>
        <span className={`chev ${open ? "open" : ""}`}>▶</span>
      </button>

      {open && (
        <div className="step-body">
          {step.repairs.map((repair) => (
            <div key={repair.attempt} className="repair-note">
              ⟲ schema violation - repair {repair.attempt}: {repair.errors[0]}
            </div>
          ))}

          {step.text && (
            <pre className="stream" ref={bodyRef}>
              {step.text}
              {step.status === "running" && <span className="caret" />}
            </pre>
          )}

          {step.step === "evaluate" && step.record && (
            <Findings
              evaluation={step.record.output as Evaluation}
              clauses={clauses}
            />
          )}

          {step.record && (
            <div className="step-meta">
              <span className="badge">{step.record.model}</span>
              <span className="badge">schema ✓</span>
              {step.record.repairs > 0 && (
                <span className="badge warn">{step.record.repairs} repair(s)</span>
              )}
              {step.record.usage && (
                <span className="badge">{step.record.usage.total} tokens</span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Findings({
  evaluation,
  clauses,
}: {
  evaluation: Evaluation;
  clauses: Clause[];
}) {
  const byId = new Map(clauses.map((c) => [c.id, c]));
  if (!evaluation?.findings) return null;

  return (
    <div>
      {evaluation.findings.map((finding: ClauseFinding) => (
        <div key={finding.clause_id} className="finding">
          <div className="finding-head">
            <span className="cid">{finding.clause_id}</span>
            <span className="clabel">
              {byId.get(finding.clause_id)?.label ?? "Clause"}
            </span>
            <span className={`verdict-tag ${finding.finding}`}>{finding.finding}</span>
          </div>
          <div className="positions">
            <div className="position">
              <strong>Plaintiff:</strong> {finding.plaintiff_position}
            </div>
            <div className="position">
              <strong>Defendant:</strong> {finding.defendant_position}
            </div>
          </div>
          <div className="basis">{finding.rationale}</div>
          <div className="cites">
            cites
            {finding.supporting_evidence.length === 0 && <span>- nothing</span>}
            {finding.supporting_evidence.map((id) => (
              <span key={id} className="cite">
                {id}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditTrail({ result }: { result: ArbitrationResult }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Audit trail</h2>
        <span className="badge">{result.trail.length} steps recorded</span>
      </div>
      <div className="panel-body">
        <table className="trail-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Engine</th>
              <th>Input</th>
              <th>Schema</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {result.trail.map((record, i) => (
              <tr key={`${record.step}-${i}`}>
                <td>{record.label}</td>
                <td className="num">{record.model}</td>
                <td className="num">{record.input_digest}</td>
                <td className="num">
                  {record.validated ? "✓" : "✗"}
                  {record.repairs > 0 && ` (${record.repairs}r)`}
                </td>
                <td className="num">
                  {((record.endedAt - record.startedAt) / 1000).toFixed(1)}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div className="conf-cell" style={{ padding: 0 }}>
            <div className="k">Verdict digest - the payload the vault settles against</div>
            <div className="digest">{result.digest}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the rail shows for a visitor's own case; ids mirror the server's. */
function displayBundle(input: CustomDisputeInput, vaultId: string): DisputeBundle {
  let n = 0;
  return {
    vaultId,
    contract: { id: "custom", title: input.title?.trim() || "Custom dispute", text: input.contract },
    claim: input.claim.trim(),
    plaintiff: { name: input.plaintiff.trim() || "Plaintiff", address: "0xPLAINTIFF" },
    defendant: { name: input.defendant.trim() || "Defendant", address: "0xDEFENDANT" },
    evidence: input.evidence
      .filter((d) => d.text.trim().length >= 10)
      .map((d) => ({
        id: `e${++n}`,
        party: d.party,
        filename: d.filename?.trim() || `document-${n}.txt`,
        text: d.text,
      })),
  };
}

/* ---------------------------------------------------------------- */
/* Shell pieces                                                      */
/* ---------------------------------------------------------------- */

type Page = "overview" | "dispute" | "evidence" | "escrow" | "audit" | "custom";

const PAGES: Array<{ id: Page; label: string; title: string; subtitle: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", title: "Overview", subtitle: "The escrow, where it sits, and what has been decided.", icon: <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /> },
  { id: "dispute", label: "Dispute", title: "Dispute", subtitle: "The case, the reasoning as it streams, and the verdict.", icon: <Icon d="M12 3v18M7.5 21h9M4 7.5h16M4 7.5l-2.5 6a3 3 0 0 0 5 0zM20 7.5l2.5 6a3 3 0 0 1-5 0z" /> },
  { id: "evidence", label: "Evidence", title: "Evidence", subtitle: "Every document, and what the screening found in it.", icon: <Icon d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" /> },
  { id: "escrow", label: "Escrow", title: "Escrow", subtitle: "Where the money sits while the dispute is open, and how it settles.", icon: <Icon d="M3 10h18M5 10V7l7-4 7 4v3M5 10v9h14v-9M10 14h4" /> },
  { id: "audit", label: "Audit", title: "Audit trail", subtitle: "What ran, what it cost, and the digest the vault settles against.", icon: <Icon d="M4 5h16v14H4zM8 9h8M8 13h5M15 13l2 2 3-3" /> },
  { id: "custom", label: "Your case", title: "Bring your own dispute", subtitle: "Paste a contract and evidence; Judr decides it live.", icon: <Icon d="M12 5v14M5 12h14" /> },
];

const STATUS_LABEL: Record<Vault["status"], string> = {
  funded: "funded",
  disputed: "disputed",
  verdict_posted: "verdict posted",
  released: "released",
  appealed: "under appeal",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function StatTile({ label, value, unit, caption, tone }: { label: string; value: string; unit?: string; caption: string; tone?: "ok" | "bad" | "warn" }) {
  return (
    <div className="tile">
      <div className="tile-k">{label}</div>
      <div className={`tile-v ${tone ?? ""}`}>
        {value}
        {unit && <span className="tile-unit">{unit}</span>}
      </div>
      <div className="tile-n">{caption}</div>
    </div>
  );
}

/** The live IXS list, as the allocation agent sees it. */
function IxsVaultsPanel() {
  const [snap, setSnap] = useState<IxsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/allocate")
      .then((r) => r.json())
      .then(setSnap)
      .catch(() => setFailed(true));
  }, []);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>IXS vaults</h2>
        {snap && <span className={`badge ${snap.source === "live" ? "live" : "recorded"}`}>{snap.source === "live" ? "live read" : "recorded snapshot"}</span>}
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {!snap && !failed && <div className="feed-empty">Reading IXS…</div>}
        {failed && <div className="feed-empty">IXS could not be read.</div>}
        {snap && (
          <table className="vt">
            <thead><tr><th>Vault</th><th>Chain</th><th>Access</th><th>TTM</th><th>On-chain</th></tr></thead>
            <tbody>
              {snap.vaults.map((v) => (
                <tr key={v.id}>
                  <td>{v.name} <span className="mono dim">{v.symbol}</span></td>
                  <td>{v.chainName}</td>
                  <td><span className={`badge ${v.permissionless ? "ok" : ""}`}>{v.permissionless ? "permissionless" : "whitelist"}</span></td>
                  <td className="mono">{(v.ttmRate * 100).toFixed(2)}%</td>
                  <td className="mono dim">{v.onchain ? `${v.onchain.tvl.toLocaleString("en-US")} ${v.asset.symbol} · share ${v.onchain.sharePrice}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
