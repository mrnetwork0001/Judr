import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

/*
 * The small hand-set details that make the landing page Judr's own: the scales
 * mark, the hairline that lifts into it, the small-caps eyebrow above every
 * heading, and the "Fig." captions under the specimens.
 *
 * All of it is decorative and marked aria-hidden. The page reads identically
 * with images off.
 */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

/** Large serif numerals for the numbered steps. */
export function Numeral({ n }: { n: number }) {
  return (
    <span className="numeral" aria-hidden="true">
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** "Fig. 1" captions under the specimens, as in a printed guide. */
export function FigCaption({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figcaption className="figcaption">
      <span className="fig">{label}</span>
      <span>{children}</span>
    </figcaption>
  );
}

/**
 * The mark: a balance whose beam is level and whose pans hang from it. Level
 * rather than tipped, because the claim is that the decision is reached rather
 * than assumed.
 */
export function ScaleRule({ className }: { className?: string }) {
  return (
    <div className={`scale-rule ${className ?? ""}`} aria-hidden="true">
      <span />
      <svg viewBox="0 0 48 24" fill="none">
        <path
          d="M12 12h24M24 12v8M20 20h8M12 12v2M36 12v2"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <path d="M8 14a4 4 0 0 0 8 0Z" fill="var(--accent)" />
        <path
          d="M32 14a4 4 0 0 0 8 0Z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
      <span />
    </div>
  );
}

export function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="m3 8.5 3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 3v10m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M5 11 11 5m0 0H6m5 0v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link className="wordmark" href={href} aria-label="Judr">
      <Image src="/brand/judr-header.png" alt="Judr" width={720} height={202} unoptimized priority />
    </Link>
  );
}
