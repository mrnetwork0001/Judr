"use client";

import { useEffect, useRef, useState } from "react";
import sample from "@/lib/sample-run.json";
import { FeedSpecimen, FindingSpecimen, GuardSpecimen, VerdictSpecimen } from "./fragments";

/*
 * The hero vignette, played as a loop. The four cards replay the saved run
 * in order: screening returns and the flag appears, the clauses and the
 * finding follow, the three adjudications count in, the verifier passes and
 * the verdict fills. Then it rests, fades, and starts again. Every figure is
 * the saved run's own; the loop only decides when each one comes into view.
 * The cards also drift a little, and lean away from the pointer.
 */

const TRAIL = (sample as { trail: Array<{ startedAt: number; endedAt: number }> }).trail;
const SCALE = 0.22; // the run's 36.5 s, played in about 8
const HOLD_MS = 3400; // rest on the finished verdict
const RESET_MS = 520; // cross-fade before the loop restarts
const ENDS = TRAIL.reduce<number[]>((acc, r) => {
  const prev = acc[acc.length - 1] ?? 0;
  acc.push(prev + Math.max(450, (r.endedAt - r.startedAt) * SCALE));
  return acc;
}, []);
const LAST = ENDS[ENDS.length - 1];
const CYCLE = LAST + HOLD_MS + RESET_MS;

type Frame = { done: number; resetting: boolean };
const FINAL: Frame = { done: TRAIL.length, resetting: false };

function frameAt(t: number): Frame {
  if (t >= LAST + HOLD_MS) return { done: TRAIL.length, resetting: true };
  let done = 0;
  while (done < ENDS.length && ENDS[done] <= t) done += 1;
  return { done, resetting: false };
}

export default function HeroLive() {
  // The server renders the finished story; the loop starts after hydration.
  const [frame, setFrame] = useState<Frame>(FINAL);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Begin in the reset phase so the finished card fades before step one.
    const t0 = performance.now() + 700 - (LAST + HOLD_MS);
    let raf = 0;
    const tick = (now: number) => {
      const next = frameAt(((now - t0) % CYCLE + CYCLE) % CYCLE);
      setFrame((prev) => (prev.done === next.done && prev.resetting === next.resetting ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = grid.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    el.style.setProperty("--py", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  };
  const onLeave = () => {
    grid.current?.style.setProperty("--px", "0");
    grid.current?.style.setProperty("--py", "0");
  };

  const { done, resetting } = frame;
  const stage: 0 | 1 | 2 | 3 = done >= 7 ? 3 : done >= 6 ? 2 : done >= 5 ? 1 : 0;

  return (
    <div
      ref={grid}
      className={`vignette-grid vignette-live ${resetting ? "resetting" : ""}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="vignette-col">
        <div className="float f1">
          <GuardSpecimen className="rise tilt-a" pending={done < 1} />
        </div>
        <div className="float f2">
          <FindingSpecimen className="rise tilt-b" pending={done < 4} />
        </div>
      </div>
      <div className="vignette-col offset">
        <div className="float f3">
          <FeedSpecimen className="rise tilt-c" done={done} />
        </div>
        <div className="float f4">
          <VerdictSpecimen className="rise tilt-d" stage={stage} />
        </div>
      </div>
    </div>
  );
}
