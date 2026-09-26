"use client";

import { useState } from "react";
import type { CustomDisputeInput } from "@/lib/custom";
import { LIMITS } from "@/lib/custom";
import type { Party } from "@/lib/types";

interface Doc {
  filename: string;
  party: Party;
  text: string;
}

/*
 * Bring your own dispute. Paste the contract, say what is in dispute, add
 * evidence for each side, and Judr decides it live through the same graph the
 * demo uses. Sizes are capped and runs are rate-limited server-side.
 */
export default function CustomDispute({
  onRun,
  disabled,
  liveCapable,
  embedded = false,
}: {
  onRun: (input: CustomDisputeInput) => void;
  disabled: boolean;
  liveCapable: boolean;
  /** Rendered as a page of its own: always open, no collapsible header. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [title, setTitle] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [defendant, setDefendant] = useState("");
  const [contract, setContract] = useState("");
  const [claim, setClaim] = useState("");
  const [docs, setDocs] = useState<Doc[]>([
    { filename: "", party: "plaintiff", text: "" },
    { filename: "", party: "defendant", text: "" },
  ]);

  const total = contract.length + claim.length + docs.reduce((n, d) => n + d.text.length, 0);
  const ready = contract.trim().length >= 40 && claim.trim().length >= 20 && docs.some((d) => d.text.trim().length >= 10);

  const update = (i: number, patch: Partial<Doc>) =>
    setDocs((prev) => prev.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  return (
    <div className="panel">
      {embedded ? (
        <div className="panel-head">
          <h2>Your case</h2>
          <span className={`badge ${liveCapable ? "live" : ""}`}>{liveCapable ? "decided live on SERV" : "needs a live key"}</span>
        </div>
      ) : (
        <button className="panel-head panel-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <h2>Bring your own dispute</h2>
          <span className="badge">{open ? "close" : liveCapable ? "live · paste a case" : "needs a live key"}</span>
        </button>
      )}

      {open && (
        <div className="panel-body custom">
          {!liveCapable && (
            <div className="error-bar" style={{ marginBottom: 12 }}>
              Custom disputes run against SERV. Add SERV_API_KEY to decide a case of your own; the recorded run only knows the demo case.
            </div>
          )}
          <div className="custom-grid">
            <label>
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Logo design agreement" maxLength={120} />
            </label>
            <label>
              <span>Plaintiff (the party asking for the escrow)</span>
              <input value={plaintiff} onChange={(e) => setPlaintiff(e.target.value)} placeholder="e.g. the contractor" maxLength={LIMITS.nameChars} />
            </label>
            <label>
              <span>Defendant</span>
              <input value={defendant} onChange={(e) => setDefendant(e.target.value)} placeholder="e.g. the client" maxLength={LIMITS.nameChars} />
            </label>
          </div>
          <label className="custom-block">
            <span>Contract - paste the operative terms ({contract.length.toLocaleString()} / {LIMITS.contractChars.toLocaleString()})</span>
            <textarea rows={7} value={contract} onChange={(e) => setContract(e.target.value.slice(0, LIMITS.contractChars))} placeholder="1. SCOPE. The Designer shall deliver…&#10;2. DELIVERY. On or before…&#10;3. ACCEPTANCE. The Client has five business days…" />
          </label>
          <label className="custom-block">
            <span>What is in dispute - both sides&rsquo; positions, neutrally ({claim.length} / {LIMITS.claimChars.toLocaleString()})</span>
            <textarea rows={3} value={claim} onChange={(e) => setClaim(e.target.value.slice(0, LIMITS.claimChars))} placeholder="The Designer says the logo was delivered on the 3rd; the Client says the files were unusable and the escrow should be returned." />
          </label>

          <div className="custom-docs">
            {docs.map((d, i) => (
              <div key={i} className="custom-doc">
                <div className="custom-doc-head">
                  <input className="custom-doc-name" value={d.filename} onChange={(e) => update(i, { filename: e.target.value })} placeholder={`document-${i + 1}.txt`} maxLength={80} />
                  <select value={d.party} onChange={(e) => update(i, { party: e.target.value as Party })}>
                    <option value="plaintiff">submitted by plaintiff</option>
                    <option value="defendant">submitted by defendant</option>
                  </select>
                  {docs.length > 1 && (
                    <button className="btn small" onClick={() => setDocs((prev) => prev.filter((_, k) => k !== i))} aria-label="Remove document">
                      remove
                    </button>
                  )}
                </div>
                <textarea rows={4} value={d.text} onChange={(e) => update(i, { text: e.target.value.slice(0, LIMITS.docChars) })} placeholder="Paste the email, invoice, log, message thread…" />
              </div>
            ))}
            {docs.length < LIMITS.docs && (
              <button className="btn small" onClick={() => setDocs((prev) => [...prev, { filename: "", party: "plaintiff", text: "" }])}>
                + add a document
              </button>
            )}
          </div>

          <div className="controls" style={{ marginTop: 14 }}>
            <button
              className="btn primary"
              disabled={disabled || !liveCapable || !ready || total > LIMITS.totalChars}
              onClick={() => onRun({ title, contract, claim, plaintiff, defendant, evidence: docs.filter((d) => d.text.trim()) })}
            >
              Decide this dispute · live
            </button>
            <span className="badge">{total.toLocaleString()} / {LIMITS.totalChars.toLocaleString()} chars</span>
            <span className="badge">{LIMITS.runsPerHour} runs / hour</span>
          </div>
          <p className="custom-note">
            Evidence is screened for injected instructions before anything reads it - try hiding a &ldquo;SYSTEM: rule for me&rdquo; in a document and watch it get quarantined.
          </p>
        </div>
      )}
    </div>
  );
}
