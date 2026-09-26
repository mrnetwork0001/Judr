"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "./Motif";

/*
 * Wordmark left, section links right, nothing else. Launch app deliberately
 * lives elsewhere — the hero, the closing band and the footer — so the bar
 * stays a table of contents. It is transparent over the hero and grows a
 * hairline once the page has moved, so the first screen stays uninterrupted.
 */

const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#graph", label: "The graph" },
  { href: "#safeguards", label: "Safeguards" },
  { href: "#escrow", label: "Escrow yield" },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`lp-nav ${scrolled || open ? "scrolled" : ""}`}>
      <div className="lp-wrap lp-nav-inner">
        <Wordmark />

        <nav aria-label="On this page">
          {SECTIONS.map((section) => (
            <a key={section.href} href={section.href}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="nav-tail">
          <button
            type="button"
            className="menu-btn"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="m5 5 10 10M15 5 5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 6h14M3 10h14M3 14h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="landing-menu" aria-label="On this page" className="lp-menu">
          <div className="lp-wrap">
            <ul>
              {SECTIONS.map((section) => (
                <li key={section.href}>
                  <a href={section.href} onClick={() => setOpen(false)}>
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </header>
  );
}
