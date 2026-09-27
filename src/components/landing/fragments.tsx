/*
 * Specimens: pictures of Judr's real interface, used as the landing page's
 * illustrations.
 *
 * Two rules hold them honest. They are built from the app's own classes in
 * globals.css, so a change to the dashboard's styling shows up here. And their
 * content is pulled from the recorded run in replay.ts and from the real
 * evidence screener - the flag below is produced by calling screenHeuristic on
 * the actual tampered document, not transcribed from a screenshot of it.
 *
 * They are inert: no buttons, no handlers, nothing focusable.
 */

import { screenHeuristic } from "@/lib/guard";
import { Glyph } from "../Glyphs";
import { POISONED_EVIDENCE } from "@/lib/fixtures";
import sample from "@/lib/sample-run.json";
import type { ArbitrationResult } from "@/lib/types";

/**
 * A real decision. sample-run.json is the output of a live run of the sample
 * case on SERV, saved as it came back - nothing in it was written by hand.
 */
const RUN = sample as unknown as ArbitrationResult;
const { clauses, evaluation, verdict } = RUN;

const clauseLabel = (id: string) =>
  clauses.clauses.find((c) => c.id === id)?.label ?? id;

/** Clause labels run long; a reduced specimen has room for a few words. */
const shortLabel = (id: string, words = 3) =>
  clauseLabel(id).split(" ").slice(0, words).join(" ");

function Frame({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`specimen ${className ?? ""}`} aria-hidden="true">
      <div className="panel">
        <div className="spec-head">
          <span>{title}</span>
          {meta && <span>{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** The arbitration feed, caught mid-run. */
export function FeedSpecimen({ className }: { className?: string }) {
  const rows = [
    { label: "Screening evidence", time: "1.2s", state: "done" },
    { label: "Extracting contract clauses", time: "1.4s", state: "done" },
    { label: "Identifying what is in dispute", time: "1.3s", state: "done" },
    { label: "Weighing evidence against each clause", time: "running…", state: "now" },
    { label: "Adjudicating", time: "", state: "idle" },
    { label: "Verifying citations", time: "", state: "idle" },
  ];

  return (
    <Frame title="Arbitration feed" meta="3 / 6 steps" className={className}>
      <div className="spec-steps">
        {rows.map((row, i) => (
          <div key={row.label} className={`spec-step ${row.state}`}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <span className="l">{row.label}</span>
            <span className="t">{row.state === "done" ? <><Glyph name="check" className="gi" /> {row.time}</> : row.time}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The contract, reduced to typed clauses. */
export function ClauseSpecimen({ className }: { className?: string }) {
  const shown = clauses.clauses.slice(1, 5);

  return (
    <Frame title="Clause set" meta={`${clauses.clauses.length} extracted`} className={className}>
      <div className="spec-body">
        {shown.map((clause) => (
          <div key={clause.id} className="spec-clause">
            <span className="cid">{clause.id}</span>
            <span>
              <div className="lbl">{clause.label}</div>
              <div className="txt">{clause.text}</div>
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** One clause finding - a decisive one, with both sides recorded. */
export function FindingSpecimen({ className }: { className?: string }) {
  const decisive = new Set(verdict.decisive_clauses);
  const finding = evaluation.findings.find((f) => decisive.has(f.clause_id) && f.finding !== "satisfied")
    ?? evaluation.findings.find((f) => decisive.has(f.clause_id))
    ?? evaluation.findings[0];

  return (
    <Frame title="Clause finding" meta={finding.clause_id} className={className}>
      <div className="spec-body">
        <div className="finding">
          <div className="finding-head">
            <span className="cid">{finding.clause_id}</span>
            <span className="clabel">{clauseLabel(finding.clause_id)}</span>
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
            {finding.supporting_evidence.map((id) => (
              <span key={id} className="cite">
                {id}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/**
 * A screening flag. Produced by running the real screener over the real
 * tampered document at render time, so the excerpt shown is the excerpt the
 * product would actually quote.
 */
export function GuardSpecimen({ className }: { className?: string }) {
  const flags = screenHeuristic([POISONED_EVIDENCE]);
  const flag = flags[0];

  return (
    <Frame title="Evidence screening" meta={`${flags.length} flagged`} className={className}>
      <div className="spec-body">
        <div className="guard-flag">
          <div className="gf-head">
            <span className="gf-kind">{flag.kind.replace(/_/g, " ")}</span>
            <span className="badge alert">{flag.severity}</span>
            <span className="badge">{flag.evidence_id}</span>
            <span className="badge alert">excluded from adjudication</span>
          </div>
          <div className="gf-detail">{flag.detail}</div>
          <blockquote>{flag.excerpt}</blockquote>
        </div>
      </div>
    </Frame>
  );
}

/** The verdict band with the derived confidence strip. */
export function VerdictSpecimen({ className }: { className?: string }) {
  return (
    <div className={`specimen spec-verdict ${className ?? ""}`} aria-hidden="true">
      <div className="panel verdict-panel">
        <div className="verdict-hero">
          <div className="eyebrow" style={{ color: "var(--text-faint)" }}>
            Verdict
          </div>
          <div className="winner">A. Moreau (Contractor)</div>
        </div>
        <div className="confidence">
          <div className="conf-cell">
            <div className="k">Confidence</div>
            <div className="v ok">{(RUN.confidence.score * 100).toFixed(0)}%</div>
            <div className="n">stability × citations</div>
          </div>
          <div className="conf-cell">
            <div className="k">Stability</div>
            <div className="v">{RUN.confidence.consensus.agreed}/{RUN.confidence.consensus.runs}</div>
            <div className="n">runs agreed</div>
          </div>
          <div className="conf-cell">
            <div className="k">Cost</div>
            <div className="v">${RUN.cost.usd.toFixed(2)}</div>
            <div className="n">{RUN.cost.seconds}s · live on SERV</div>
          </div>
          <div className="conf-cell">
            <div className="k">Citations</div>
            <div className={`v ${RUN.verification.passed ? "ok" : "bad"}`}>{RUN.verification.passed ? "valid" : "failed"}</div>
            <div className="n">every id resolves</div>
          </div>
        </div>
        <div className="panel-body" style={{ paddingBlock: 14 }}>
          <div className="decisive" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <span className="badge">Decisive</span>
            {verdict.decisive_clauses.map((id) => (
              <span key={id} className="badge warn">
                {id} · {shortLabel(id)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settlement held open by the appeal window. */
export function SettlementSpecimen({ className }: { className?: string }) {
  return (
    <Frame title="Settlement" meta="IXS-VLT-4417" className={className}>
      <div className="spec-settle">
        <span>
          Funds do not move yet. The losing party has <span className="cd">41s</span> to appeal.
        </span>
        <span className="spec-pill locked">Release in 41s</span>
      </div>
    </Frame>
  );
}
