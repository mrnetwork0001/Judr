import { Eyebrow } from "./Motif";

const STACK = [
  {
    term: "SERV reasoning",
    detail:
      "Every model step runs against SERV's OpenAI-compatible endpoint, bound to a JSON Schema and re-validated locally on the way back. Invalid output is repaired against the validator's own error list rather than accepted.",
  },
  {
    term: "IXS vaults",
    detail:
      "The escrow layer Judr settles against. The vault in this build is a mock: a state machine with the appeal window and the release refusal, standing in for the deployed contract.",
  },
  {
    term: "Next.js 16 · React 19",
    detail:
      "Server-streamed arbitration over SSE, vanilla CSS, no UI framework and no state library. Twenty unit tests run on Node's type stripping — no test framework, no build step.",
  },
];

export default function BuiltWith() {
  return (
    <section aria-labelledby="built-title" className="section sunken">
      <div className="lp-wrap">
        <div className="section-head">
          <Eyebrow>Built with</Eyebrow>
          <h2 id="built-title">What is underneath.</h2>
        </div>
        <dl className="stack">
          {STACK.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
