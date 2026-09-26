import { Eyebrow } from "./Motif";

/*
 * The argument section. The easy version of this product is one prompt that
 * reads everything and announces a winner; this is the picture of why Judr
 * isn't that. The diagram is the real pipeline - the node names are the step
 * names in src/lib/graph/steps.ts.
 */

const NODES = [
  { id: "screen", label: "screen", kind: "patterns + model", x: 8, det: true },
  { id: "extract", label: "extract_clauses", kind: "typed", x: 132, det: false },
  { id: "classify", label: "classify_claim", kind: "typed", x: 268, det: false },
  { id: "evaluate", label: "evaluate", kind: "typed", x: 404, det: false },
  { id: "adjudicate", label: "adjudicate ×3", kind: "consensus", x: 516, det: false },
  { id: "verify", label: "verify", kind: "deterministic", x: 640, det: true },
];

const BOX_W = 104;
const BOX_H = 44;
const Y = 58;

// The bracket spans the schema-bound (non-deterministic) steps.
const MODEL_NODES = NODES.filter((node) => !node.det);
const REPAIR_FROM = MODEL_NODES[0].x + BOX_W / 2;
const REPAIR_TO = MODEL_NODES[MODEL_NODES.length - 1].x + BOX_W / 2;

export default function Graph() {
  return (
    <section id="graph" aria-labelledby="graph-title" className="section sunken">
      <div className="lp-wrap">
        <div className="section-head">
          <Eyebrow>Bounded reasoning</Eyebrow>
          <h2 id="graph-title">
            One prompt gives you an answer. <em>A graph gives you a record.</em>
          </h2>
          <p className="lead">
            An arbitration decision that cannot be defended afterwards is worthless,
            because the whole point is that a losing party has to be able to accept it.
            So the work is split into narrow steps with explicit dependencies, each one
            schema-validated before the next may consume it.
          </p>
        </div>

        <div className="graph" style={{ marginTop: 44 }}>
          <svg viewBox="0 0 760 128" role="img" aria-label="The Judr reasoning graph: screen, then extract clauses, classify claim, evaluate, adjudicate three times, then verify.">
            {NODES.slice(0, -1).map((node, i) => {
              const from = node.x + BOX_W;
              const to = NODES[i + 1].x;
              return (
                <g key={node.id}>
                  <path className="edge" d={`M${from} ${Y + BOX_H / 2} H${to - 6}`} />
                  <path
                    className="edge"
                    d={`m${to - 7} ${Y + BOX_H / 2 - 3.5} 5 3.5-5 3.5`}
                  />
                </g>
              );
            })}

            {NODES.map((node) => (
              <g key={node.id}>
                <rect
                  className={`node-box ${node.det ? "det" : ""}`}
                  x={node.x}
                  y={Y}
                  width={BOX_W}
                  height={BOX_H}
                  rx="7"
                />
                <text className="node-label" x={node.x + BOX_W / 2} y={Y + 20} textAnchor="middle">
                  {node.label}
                </text>
                <text className="node-kind" x={node.x + BOX_W / 2} y={Y + 33} textAnchor="middle">
                  {node.kind}
                </text>
              </g>
            ))}

            {/*
              * Repair is per-step, not a loop back through the pipeline: a step
              * whose output fails validation is re-prompted with the validator's
              * own error list until it is valid, or the run halts. The bracket
              * spans the schema-bound steps and drops into each one.
              */}
            <path
              className="edge"
              strokeDasharray="3 3"
              d={`M${REPAIR_FROM} ${Y - 20} H${REPAIR_TO}`}
            />
            {NODES.filter((node) => !node.det).map((node) => {
              const cx = node.x + BOX_W / 2;
              return (
                <g key={`repair-${node.id}`}>
                  <path className="edge" strokeDasharray="3 3" d={`M${cx} ${Y - 20} V${Y - 8}`} />
                  <path className="edge" d={`m${cx - 3.5} ${Y - 9} 3.5 5 3.5-5`} />
                </g>
              );
            })}
            <text className="node-kind" x={(REPAIR_FROM + REPAIR_TO) / 2} y={Y - 27} textAnchor="middle">
              schema violation → repair in place
            </text>
          </svg>

          <div className="graph-key">
            <span>
              <i /> model step, schema-bound
            </span>
            <span>
              <i className="det" /> deterministic - plain code, no model
            </span>
            <span>adjudicate runs three times; agreement becomes confidence</span>
          </div>
        </div>

        <div className="cards">
          <article className="card">
            <h3>An audit trail, not an answer</h3>
            <p>
              Every step records its input digest, engine, schema result and output. A
              losing party can be shown precisely which clause and which document decided
              the matter - and can attack that step, rather than the system as a whole.
            </p>
          </article>
          <article className="card">
            <h3>Confidence that is derived</h3>
            <p>
              Models are famously bad at reporting their own certainty, so Judr never asks.
              The decision is reached several times independently and agreement is measured,
              combined with the share of decisive clauses carrying a real finding. A verdict
              that changes when you run it again is not one anybody should act on.
            </p>
          </article>
          <article className="card">
            <h3>Verification that is not a model</h3>
            <p>
              A model asked to check its own citations will agree with itself. The final pass
              is ordinary code: it resolves every clause and evidence id, and rejects a
              verdict resting on a clause that does not exist or on an indeterminate finding.
              Failure caps confidence hard.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
