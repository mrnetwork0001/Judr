import Link from "next/link";
import { ArrowUpRight, Wordmark } from "./Motif";

const REPO = "https://github.com/mrnetwork0001/judr";

export default function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="footer-grid">
          <div>
            <Wordmark />
            <p className="blurb">
              An arbitration layer for tokenized real-world assets. Evidence in, a verdict
              with a complete audit trail out, and a vault that settles against it — with
              an appeal window before anything moves.
            </p>
          </div>

          <nav className="footer-col" aria-label="Footer: on this page">
            <p className="h">On this page</p>
            <ul>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#graph">The graph</a>
              </li>
              <li>
                <a href="#safeguards">Safeguards</a>
              </li>
            </ul>
          </nav>

          <nav className="footer-col" aria-label="Footer: Judr">
            <p className="h">Judr</p>
            <ul>
              <li>
                <Link href="/app">Launch app</Link>
              </li>
              <li>
                <a href={REPO} target="_blank" rel="noreferrer">
                  Source on GitHub
                  <ArrowUpRight className="icon" />
                  <span className="skip">(opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className="colophon">
          Built for the OpenServ SERV Hackathon, Edition 01 — IXS Vaults and Open Track.
          The vault is a mock and the dispute is fictional. Judr is a demonstration of how
          an automated decision can be made auditable; it is not legal advice and it does
          not replace arbitration where arbitration is worth its cost.
        </p>
      </div>
    </footer>
  );
}
