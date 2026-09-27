/*
 * Judr's own glyph set. Every icon in the app is built from the two elements
 * of the mark: horizontal bars in the current text colour and one solid block
 * in the brand green. No emoji, no stock icon set, so the interface reads in
 * one hand from the favicon to the smallest status tick.
 *
 * All glyphs sit on a 16-unit grid. Bars are 2 units tall; the block is the
 * only thing that is ever green.
 */

export type GlyphName =
  | "mark"
  | "dispute"
  | "evidence"
  | "escrow"
  | "audit"
  | "custom"
  | "check"
  | "cross"
  | "chevron"
  | "repair"
  | "arrow"
  | "external"
  | "down"
  | "menu";

const BRAND = "var(--brand)";

function Bar({ x, y, w }: { x: number; y: number; w: number }) {
  return <rect x={x} y={y} width={w} height={2} fill="currentColor" />;
}

function Block({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect className="b" x={x} y={y} width={w} height={h} fill={BRAND} />;
}

const SHAPES: Record<GlyphName, React.ReactNode> = {
  // The mark: four bars, the block set into the two short ones.
  mark: (
    <>
      <Bar x={1} y={2} w={14} />
      <Bar x={1} y={6} w={9} />
      <Bar x={1} y={10} w={9} />
      <Bar x={1} y={14} w={14} />
      <Block x={12} y={6} w={3} h={6} />
    </>
  ),
  // Two parties, a decision between them.
  dispute: (
    <>
      <Bar x={1} y={2} w={5} />
      <Bar x={1} y={6} w={5} />
      <Bar x={1} y={10} w={5} />
      <Bar x={1} y={14} w={5} />
      <Bar x={10} y={2} w={5} />
      <Bar x={10} y={6} w={5} />
      <Bar x={10} y={10} w={5} />
      <Bar x={10} y={14} w={5} />
      <Block x={7} y={5} w={2} h={6} />
    </>
  ),
  // A document, stamped.
  evidence: (
    <>
      <Bar x={1} y={2} w={14} />
      <Bar x={1} y={6} w={14} />
      <Bar x={1} y={10} w={9} />
      <Bar x={1} y={14} w={6} />
      <Block x={11} y={11} w={4} h={5} />
    </>
  ),
  // Money held between two rails.
  escrow: (
    <>
      <Bar x={1} y={1} w={14} />
      <Bar x={1} y={13} w={14} />
      <Block x={5} y={5} w={6} h={6} />
    </>
  ),
  // A ledger with one line sealed.
  audit: (
    <>
      <Bar x={1} y={2} w={14} />
      <Bar x={1} y={6} w={14} />
      <Bar x={1} y={10} w={8} />
      <Bar x={1} y={14} w={14} />
      <Block x={11} y={9} w={4} h={4} />
    </>
  ),
  // A new entry.
  custom: (
    <>
      <rect x={7} y={1} width={2} height={14} fill="currentColor" />
      <Bar x={1} y={7} w={14} />
      <Block x={5.5} y={5.5} w={5} h={5} />
    </>
  ),
  // Sealed: the block on a bar.
  check: (
    <>
      <Block x={3} y={2} w={10} h={9} />
      <Bar x={3} y={13} w={10} />
    </>
  ),
  // Not sealed: the block's outline, in the failure colour.
  cross: (
    <>
      <rect x={3.75} y={2.75} width={8.5} height={7.5} fill="none" stroke="var(--bad)" strokeWidth={1.5} />
      <rect x={3} y={13} width={10} height={2} fill="var(--bad)" />
    </>
  ),
  // Disclosure: two bars meeting at a point.
  chevron: <path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />,
  // A line moved back into place.
  repair: (
    <>
      <Bar x={1} y={4} w={9} />
      <Bar x={5} y={10} w={9} />
      <Block x={12} y={3} w={3} h={4} />
    </>
  ),
  // Forward: a bar with the block as its head.
  arrow: (
    <>
      <Bar x={1} y={7} w={9} />
      <Block x={11} y={5} w={4} h={6} />
    </>
  ),
  // Out: a bar rising to the block.
  external: (
    <>
      <rect x={1.6} y={12} width={12} height={2} transform="rotate(-45 7.6 13)" fill="currentColor" />
      <Block x={10} y={1} w={5} h={5} />
    </>
  ),
  // Down: a bar falling onto the block.
  down: (
    <>
      <rect x={7} y={1} width={2} height={9} fill="currentColor" />
      <Block x={5} y={11} w={6} h={4} />
    </>
  ),
  // The menu button is the mark with three bars.
  menu: (
    <>
      <Bar x={1} y={3} w={14} />
      <Bar x={1} y={8} w={9} />
      <Bar x={1} y={13} w={14} />
      <Block x={12} y={7} w={3} h={4} />
    </>
  ),
};

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      {SHAPES[name]}
    </svg>
  );
}
