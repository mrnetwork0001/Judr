import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Glyph } from "../Glyphs";

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
export function MarkRule({ className }: { className?: string }) {
  return (
    <div className={`mark-rule ${className ?? ""}`} aria-hidden="true">
      <span />
      <Glyph name="mark" />
      <span />
    </div>
  );
}

export function Check({ className }: { className?: string }) {
  return <Glyph name="check" className={className} />;
}

export function ArrowDown({ className }: { className?: string }) {
  return <Glyph name="down" className={className} />;
}

export function ArrowUpRight({ className }: { className?: string }) {
  return <Glyph name="external" className={className} />;
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link className="wordmark" href={href} aria-label="Judr">
      <Image src="/brand/judr-header.png" alt="Judr" width={720} height={202} unoptimized priority />
    </Link>
  );
}
