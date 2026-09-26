import Link from "next/link";
import { ScalesMark } from "./Motif";

export default function ClosingCta() {
  return (
    <section id="closing" aria-labelledby="closing-title" className="closing">
      <div className="lp-wrap">
        <div className="closing-band closing-grid">
        <div>
          <ScalesMark className="closing-mark" />
          <h2 id="closing-title">
            Watch it decide. <em>It takes about ten seconds.</em>
          </h2>
          <p className="lead" style={{ marginTop: 20 }}>
            The demo runs a real dispute end to end: seven steps, a verdict that turns on a
            deadline neither party leads with, and an escrow that settles. Tick{" "}
            <strong style={{ color: "var(--text)", fontWeight: 500 }}>
              Include tampered evidence
            </strong>{" "}
            to watch an injected instruction get caught and thrown out.
          </p>
        </div>
        <div className="closing-ctas">
          <Link className="lp-btn accent" href="/app">
            Launch app
          </Link>
          <a className="lp-btn secondary" href="#how">
            Read how it works
          </a>
        </div>
        </div>
      </div>
    </section>
  );
}
