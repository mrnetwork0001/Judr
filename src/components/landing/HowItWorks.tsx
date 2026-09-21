import type { ReactNode } from "react";
import {
  ClauseSpecimen,
  FindingSpecimen,
  GuardSpecimen,
  SettlementSpecimen,
} from "./fragments";
import { Eyebrow, Numeral, ScaleRule } from "./Motif";

const STEPS: ReadonlyArray<{ title: string; body: string; specimen: ReactNode }> = [
  {
    title: "Evidence is screened before it is read",
    body:
      "Evidence comes from the parties, so it is adversarial by construction. Every document is checked for text aimed at the adjudicator rather than at the facts — forged system turns, instructions to disregard the contract, demands for a particular outcome. Deterministic patterns catch what cannot be talked out of firing; a model pass catches the rest. High-severity hits are quarantined and excluded from the decision entirely.",
    specimen: <GuardSpecimen />,
  },
  {
    title: "The contract becomes typed clauses",
    body:
      "Each operative term is extracted verbatim and given a stable identifier: the obligation, the deadline, the notice period, the exclusion. Nothing is paraphrased and nothing is invented. Every later step refers to clauses by id, which is what makes the final citation check possible.",
    specimen: <ClauseSpecimen />,
  },
  {
    title: "Evidence is weighed clause by clause",
    body:
      "Not in aggregate. For each clause in dispute, both sides' positions are recorded, the documents relied on are cited by id, and the clause is marked satisfied, breached or indeterminate. An honest indeterminate is worth more than a confident guess — the verdict is not permitted to rest on one.",
    specimen: <FindingSpecimen />,
  },
  {
    title: "The verdict is verified, then posted — not executed",
    body:
      "A deterministic pass resolves every clause and evidence id the verdict cites and rejects anything that does not hold up. Then the verdict is posted with its digest and an appeal window. The vault refuses a release call until that window closes unchallenged, so being wrong costs a delay rather than somebody's escrow.",
    specimen: <SettlementSpecimen />,
  },
];

export default function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="section">
      <div className="lp-wrap split">
        <div className="section-head">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="how-title">From a pile of documents to a decision you can audit.</h2>
          <p className="lead">
            Four steps. Each one produces typed output that is checked before the next
            step is allowed to see it.
          </p>
          <ScaleRule className="lp-hide-sm" />
        </div>

        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Numeral n={index + 1} />
              <div>
                <h3>{step.title}</h3>
                <p className="prose">{step.body}</p>
                <div className="specimen-slot">{step.specimen}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
