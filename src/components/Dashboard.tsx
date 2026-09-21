"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import VaultPanel from "./VaultPanel";
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
}: {
  initialVault: Vault;
  dispute: DisputeBundle;
  poisonedDispute: DisputeBundle;
  liveCapable: boolean;
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
  const [mode, setMode] = useState<"live" | "recorded" | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const activeDispute = poisoned ? poisonedDispute : dispute;

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleEvent = useCallback((event: ArbitrationEvent) => {
    switch (event.type) {
      case "step_started": {
        if (event.step === "mode") {
          setMode(event.label.startsWith("Live") ? "live" : "recorded");
          return;
        }
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

  const run = useCallback(async (poisonedOverride?: boolean) => {
    const usePoisoned = poisonedOverride ?? poisoned;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSteps([]);
    setFlags([]);
    setResult(null);
    setError(null);
    setMode(null);
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
        body: JSON.stringify({ poisoned: usePoisoned }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Arbitration request failed (${response.status})`);
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
  }, [handleEvent, poisoned]);

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
      setPoisoned(wantsPoison);
      // Passed explicitly: the state set above is not yet visible to run()'s
      // closure.
      if (wantsRun) void run(wantsPoison);
    }, 400);
  }, [run]);

  const vaultAction = useCallback(async (action: "appeal" | "release" | "reset") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: "The Client disputes the finding on the acceptance window",
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
  }, []);

  const reset = useCallback(async () => {
    abortRef.current?.abort();
    setSteps([]);
    setFlags([]);
    setResult(null);
    setError(null);
    setMode(null);
    await vaultAction("reset");
  }, [vaultAction]);

  const quarantined = useMemo(
    () => new Set(flags.filter((f) => f.severity === "high").map((f) => f.evidence_id)),
    [flags],
  );

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <h1>
            <Link href="/">
              <span className="mark">⚖</span> Judr
            </Link>
          </h1>
          <span className="tagline">
            Autonomous arbitration for tokenized RWA vaults
          </span>
        </div>
        <div className="masthead-meta">
          {mode === "live" && (
            <span className="badge live">
              <span className="dot pulse" /> Live · SERV
            </span>
          )}
          {mode === "recorded" && (
            <span className="badge recorded">
              <span className="dot" /> Recorded run
            </span>
          )}
          {!liveCapable && mode === null && (
            <span className="badge recorded">No SERV key · replay mode</span>
          )}
          <button className="btn small" onClick={reset} disabled={running || busy}>
            Reset demo
          </button>
        </div>
      </header>

      <div className="columns">
        <aside className="rail">
          <VaultPanel vault={vault} dispute={activeDispute} result={result} />

          <div className="panel">
            <div className="panel-head">
              <h2>Evidence</h2>
              <span className="badge">{activeDispute.evidence.length} documents</span>
            </div>
            <div className="panel-body">
              {activeDispute.evidence.map((doc) => (
                <div
                  key={doc.id}
                  className={`evidence-item ${quarantined.has(doc.id) ? "quarantined" : ""}`}
                >
                  <span className="eid">{doc.id}</span>
                  <span style={{ minWidth: 0 }}>
                    <div className="fname">{doc.filename}</div>
                    <div className="side">
                      {doc.party === "plaintiff"
                        ? activeDispute.plaintiff.name
                        : activeDispute.defendant.name}
                      {quarantined.has(doc.id) && " · quarantined"}
                    </div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="stage">
          <div className="panel">
            <div className="panel-head">
              <h2>Dispute</h2>
              <span className="badge">{activeDispute.vaultId}</span>
            </div>
            <div className="panel-body">
              <p style={{ margin: "0 0 16px", color: "var(--text-dim)", maxWidth: "70ch" }}>
                {activeDispute.claim}
              </p>
              <div className="controls">
                <button className="btn primary" onClick={() => void run()} disabled={running}>
                  {running ? "Arbitrating…" : "Run arbitration"}
                </button>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={poisoned}
                    onChange={(e) => setPoisoned(e.target.checked)}
                    disabled={running}
                  />
                  Include tampered evidence
                </label>
                {poisoned && (
                  <span className="badge alert">
                    e7 contains an injected instruction
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && <div className="error-bar">{error}</div>}

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
                      {flag.severity === "high" && (
                        <span className="badge alert">excluded from adjudication</span>
                      )}
                    </div>
                    <div className="gf-detail">{flag.detail}</div>
                    <blockquote>{flag.excerpt}</blockquote>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Feed
            steps={steps}
            open={open}
            setOpen={setOpen}
            clauses={result?.clauses.clauses ?? []}
          />

          {result && (
            <>
              <VerdictPanel
                result={result}
                vault={vault}
                busy={busy}
                onAppeal={() => vaultAction("appeal")}
                onRelease={() => vaultAction("release")}
              />
              <AuditTrail result={result} />
            </>
          )}
        </main>
      </div>
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
              ⟲ schema violation — repair {repair.attempt}: {repair.errors[0]}
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
            {finding.supporting_evidence.length === 0 && <span>— nothing</span>}
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
            <div className="k">Verdict digest — the payload the vault settles against</div>
            <div className="digest">{result.digest}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
