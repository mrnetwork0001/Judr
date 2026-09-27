import { GuardSpecimen } from "./fragments";
import { Eyebrow, Numeral } from "./Motif";

/*
 * The objections section. Everyone's first reaction to "an AI decides who gets
 * the escrow" is distrust, and that reaction is correct. Rather than arguing
 * with it, this section states what the system is not allowed to do.
 */

const COMMITMENTS = [
  {
    title: "A verdict moves no money by itself",
    body:
      "A verdict is posted, not executed. It carries a digest over the decision payload and opens an appeal window, and the vault refuses a release call until that window closes - the check lives with the funds, not with the caller. Only then, or after a reviewer decides an appeal, does the escrow agent pay the winner, and the case shows the transaction. An appeal halts settlement and escalates to human review; Judr cannot overrule one.",
  },
  {
    title: "Tampered evidence is quarantined, not cleaned up",
    body:
      "A document that tries to instruct the adjudicator is excluded from the decision entirely, and the exclusion is recorded in the audit trail. It is never sanitised and used anyway. Screening is deterministic first, so it holds even when the model pass is unavailable.",
  },
  {
    title: "A verdict must rest on something real",
    body:
      "Every clause and evidence identifier is resolved against what was actually submitted. A decision citing a clause that does not appear in the contract, or leaning on a finding the evidence did not settle, fails verification and is reported as failed rather than quietly shipped.",
  },
];

export default function Safeguards() {
  return (
    <section id="safeguards" aria-labelledby="safeguards-title" className="section">
      <div className="lp-wrap split">
        <div className="section-head">
          <Eyebrow>Safeguards</Eyebrow>
          <h2 id="safeguards-title">
            The right reaction to an automated judge is <em>distrust.</em>
          </h2>
          <p className="lead">
            So the interesting question is not how confident the system sounds. It is what
            the system is structurally prevented from doing.
          </p>
          <div className="specimen-slot lp-hide-sm">
            <GuardSpecimen />
          </div>
        </div>

        <ol className="steps">
          {COMMITMENTS.map((commitment, index) => (
            <li key={commitment.title}>
              <Numeral n={index + 1} />
              <div>
                <h3>{commitment.title}</h3>
                <p className="prose">{commitment.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
