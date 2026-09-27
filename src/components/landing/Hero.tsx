import type { CSSProperties } from "react";
import Link from "next/link";
import HeroLive from "./HeroLive";
import { ArrowDown, Check, Eyebrow, FigCaption } from "./Motif";

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

const ASSURANCES = [
  "Every verdict names the clause that decided it",
  "Confidence is measured across re-runs, never self-reported",
  "Funds move on-chain only after the appeal window closes, or a reviewer decides",
];

/*
 * The vignette is the product itself, laid out like papers on a desk: the
 * screening flag that caught a tampered document, the clause finding that
 * decided the matter, the verdict it produced, and the feed ticking beside
 * them.
 */
function HeroVignette() {
  return (
    <figure className="vignette">
      <HeroLive />
      <FigCaption label="Fig. 1">
        Judr&rsquo;s own interface, telling one story. A. Moreau and B. Adeyemi are a sample
        case; the reasoning shown is a real decision, made live on SERV on 26 September 2026
        and saved as it came back, timings included.
      </FigCaption>
    </figure>
  );
}

export default function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="hero">
      <div className="lp-wrap hero-grid">
        <div>
          <div className="rise">
            <Eyebrow>Autonomous arbitration for tokenized RWAs</Eyebrow>
          </div>

          <h1 id="hero-title" className="rise" style={delay(0.05)}>
            Too small to litigate.
            <em>Too big to walk away from.</em>
          </h1>

          <p className="lead rise" style={delay(0.12)}>
            When capital is locked in a vault against a real-world obligation and the
            parties disagree, the money is stuck. Arbitration costs more than the claim,
            so the dispute is never resolved at all. Judr reads the contract and the
            evidence, returns a verdict with a complete audit trail, and the vault
            settles against it.
          </p>

          <div className="hero-ctas rise" style={delay(0.2)}>
            <Link className="lp-btn accent" href="/app">
              Launch app
            </Link>
            <a className="lp-btn secondary" href="#how">
              See how it works
              <ArrowDown className="icon" />
            </a>
          </div>

          <ul className="assurances rise" style={delay(0.28)}>
            {ASSURANCES.map((line) => (
              <li key={line}>
                <Check />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <HeroVignette />
      </div>
    </section>
  );
}
