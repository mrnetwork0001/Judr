import React from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import v00 from './vo/v00.json'
import v01 from './vo/v01.json'
import v02 from './vo/v02.json'
import v03 from './vo/v03.json'
import v04 from './vo/v04.json'
import v05 from './vo/v05.json'
import v06 from './vo/v06.json'
import v07 from './vo/v07.json'
import v08 from './vo/v08.json'
import v09 from './vo/v09.json'
import v10 from './vo/v10.json'
import {
  BAD, BRAND, Backdrop, Body, BrowserFrame, CLAMP, Card, Chip, Count, Credit, DIM, Eyebrow, FAINT, Focus, GOLD, Hairline, HeadLine, Headline,
  LINE, LINE_2, Lockup, MONO, Mark, OK, PAPER, PartnerLogo, ProgressRail, Reveal, Rise, SANS, SERIF, SILK, TEXT, cardStyle, easeInOut, easeOut, hasClip, mark,
} from './ui'

/* ------------------------------------------------------------------- timing */

export const FPS = 30
/** Frames of picture before the voice in every scene. */
const LEAD = 8
/** Seconds of air after the voice ends. */
const TAIL: Record<string, number> = { v00: 1.4, v03: 1.0, v05: 1.2, v06: 1.0, v10: 3.0 }
const TAIL_DEFAULT = 0.7
const FADE = 6

type Words = { text: string; words: { w: string; s: number; e: number }[] }
const VO: Words[] = [v00, v01, v02, v03, v04, v05, v06, v07, v08, v09, v10]
const IDS = VO.map((_, i) => `v${String(i).padStart(2, '0')}`)
const voEnd = (i: number) => VO[i].words[VO[i].words.length - 1].e

const DURS = VO.map((_, i) => LEAD + Math.round((voEnd(i) + (TAIL[IDS[i]] ?? TAIL_DEFAULT)) * FPS))
const STARTS = DURS.reduce<number[]>((a, _, i) => [...a, i === 0 ? 0 : a[i - 1] + DURS[i - 1]], [])
export const JUDR_DURATION = DURS.reduce((n, d) => n + d, 0)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '')
/** Frame, within scene `i`, at which the narration starts the `n`th word beginning with `word`. */
const cue = (i: number, word: string, n = 0) => {
  const hits = VO[i].words.filter((w) => norm(w.w).startsWith(norm(word)))
  const w = hits[n]
  if (!w) throw new Error(`v${i}: no word "${word}" #${n}`)
  return LEAD + Math.round(w.s * FPS)
}
const cueS = (i: number, word: string, n = 0) => cue(i, word, n) / FPS

/** A mark from the capture, or a stand-in when the beat did not record one. */
const markOr = (clip: string, name: string, rect: [number, number, number, number], t = 0) => {
  try { return mark(clip, name) } catch { return { name, t, rect } }
}
const grow = (r: [number, number, number, number], dx: number, dy: number): [number, number, number, number] => [r[0] - dx, r[1] - dy, r[2] + dx * 2, r[3] + dy * 2]

/* -------------------------------------------------------------------- sound */

/** A one-shot sound effect at a frame within the current scene. */
const Sfx: React.FC<{ name: 'whoosh' | 'tick' | 'chime' | 'rise' | 'stamp'; at: number; volume?: number }> = ({ name, at, volume = 0.35 }) => (
  <Sequence from={Math.max(0, at)} layout="none">
    <Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} />
  </Sequence>
)

/**
 * The transition: the mark's four bars sweep across the frame, the green block
 * riding the second one, and the next scene is underneath when they clear.
 * Runs over 20 frames; the scene switch sits at frame 10, under full cover.
 */
const WIPE = 20
const BarWipe: React.FC = () => {
  const f = useCurrentFrame()
  const bands = [
    { top: 0, h: 270, w: 1.6, lag: 0 },
    { top: 270, h: 270, w: 1.6, lag: 1.5 },
    { top: 540, h: 270, w: 1.6, lag: 3 },
    { top: 810, h: 270, w: 1.6, lag: 4.5 },
  ]
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {bands.map((b, i) => {
        const p = easeInOut(interpolate(f - b.lag, [0, WIPE - 4.5], [0, 1], CLAMP))
        const x = -b.w * 1920 + p * (1 + b.w) * 1920
        return (
          <div key={i} style={{ position: 'absolute', top: b.top, left: 0, height: b.h, width: b.w * 1920, transform: `translateX(${x}px)`, background: i % 2 ? '#1a1a1f' : TEXT }}>
            {i === 1 && <div style={{ position: 'absolute', right: 0, top: 30, width: 320, height: b.h - 60, background: BRAND }} />}
            {i === 2 && <div style={{ position: 'absolute', right: 0, top: 30, width: 320, height: b.h - 60, background: BRAND }} />}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ layouts */

const SIDE_W = 1180
const Side: React.FC<{ step?: number; eyebrow: string; lines: HeadLine[]; children?: React.ReactNode; foot?: React.ReactNode; frame: React.ReactNode; size?: number }> = ({
  step, eyebrow, lines, children, foot, frame, size = 60,
}) => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', left: 96, top: 110, width: 540 }}>
      {step !== undefined && (<><StepNumber n={step} delay={2} /><div style={{ height: 22 }} /></>)}
      <Eyebrow delay={6}>{eyebrow}</Eyebrow>
      <div style={{ height: 18 }} />
      <Headline lines={lines} delay={10} size={size} />
      <div style={{ height: 36 }} />
      {children}
    </div>
    <div style={{ position: 'absolute', left: 96, bottom: 92, width: 540 }}>{foot}</div>
    <div style={{ position: 'absolute', right: 64, top: 0, bottom: 0, width: SIDE_W, display: 'flex', alignItems: 'center' }}>{frame}</div>
  </AbsoluteFill>
)

const StepNumber: React.FC<{ n: number; delay?: number; size?: number }> = ({ n, delay = 0, size = 96 }) => (
  <Reveal delay={delay}>
    <div style={{ fontFamily: SERIF, fontSize: size, lineHeight: 0.95, letterSpacing: '-0.02em', color: GOLD }}>{String(n).padStart(2, '0')}</div>
  </Reveal>
)

const WIDE_W = 1440
const Wide: React.FC<{ step: number; eyebrow: string; title: string; title2?: string; swapAt?: number; note?: React.ReactNode; right?: React.ReactNode; frame: React.ReactNode }> = ({
  step, eyebrow, title, title2, swapAt, note, right, frame,
}) => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', left: (1920 - WIDE_W) / 2, top: 26 }}>{frame}</div>
    <div style={{ position: 'absolute', left: (1920 - WIDE_W) / 2, right: (1920 - WIDE_W) / 2, top: 902, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <StepNumber n={step} delay={4} size={92} />
        <div>
          <Eyebrow delay={8} size={17}>{eyebrow}</Eyebrow>
          <div style={{ height: 6 }} />
          <div style={{ position: 'relative', height: 48, width: 800 }}>
            {[title, title2].map((t, i) =>
              t === undefined ? null : (
                <div key={i} style={{ position: 'absolute', left: 0, top: 0 }}>
                  <Reveal delay={i === 0 ? 12 : (swapAt ?? 0) + 8} out={i === 0 && title2 !== undefined ? swapAt : undefined}>
                    <div style={{ fontFamily: SERIF, fontSize: 40, color: TEXT, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{t}</div>
                  </Reveal>
                </div>
              ),
            )}
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: 'flex', gap: 12, height: 40, alignItems: 'center' }}>{note}</div>
        </div>
      </div>
      <div style={{ width: 560, flexShrink: 0 }}>{right}</div>
    </div>
  </AbsoluteFill>
)

/* =================================================================== S00 == */
/* Title. */

const InsetFrame: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const f = useCurrentFrame()
  const p = easeInOut(interpolate(f, [delay, delay + 46], [0, 1], CLAMP))
  const c = 'rgba(22,22,26,0.14)'
  const m = 46
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: m, top: m, height: 1.5, width: `calc((100% - ${m * 2}px) * ${p})`, background: c }} />
      <div style={{ position: 'absolute', left: m, top: m, width: 1.5, height: `calc((100% - ${m * 2}px) * ${p})`, background: c }} />
      <div style={{ position: 'absolute', right: m, bottom: m, height: 1.5, width: `calc((100% - ${m * 2}px) * ${p})`, background: c }} />
      <div style={{ position: 'absolute', right: m, bottom: m, width: 1.5, height: `calc((100% - ${m * 2}px) * ${p})`, background: c }} />
    </AbsoluteFill>
  )
}

const S00: React.FC = () => (
  <>
    <Backdrop tone="cover" />
    <InsetFrame delay={2} />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -30 }}>
        <Mark height={150} delay={2} />
        <div style={{ height: 34 }} />
        <Lockup height={132} delay={14} />
        <div style={{ height: 44 }} />
        <Hairline delay={cue(0, 'autonomous') - 6} width={140} color="rgba(22,22,26,0.3)" />
        <div style={{ height: 30 }} />
        <Reveal delay={cue(0, 'autonomous')}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 58, color: TEXT, letterSpacing: '-0.01em' }}>Autonomous arbitration for tokenized RWA escrow</div>
        </Reveal>
        <div style={{ height: 22 }} />
        <Eyebrow delay={cue(0, 'tokenized') + 6} size={20}>OpenServ SERV Hackathon · Edition 01</Eyebrow>
      </div>
    </AbsoluteFill>
  </>
)

/* =================================================================== S01 == */
/* The problem, beside the landing page replaying a real decision. */

const S01: React.FC = () => {
  const f = useCurrentFrame()
  const tContractor = cue(1, 'contractor')
  const tClient = cue(1, 'client')
  const tArb = cue(1, 'arbitration')
  const tSits = cue(1, 'sits')
  const hero = markOr('landing', 'hero', [810, 166, 598, 1028]).rect
  const focus: Focus[] = [{ rect: [hero[0] - 60, hero[1] - 10, hero[2] + 120, 720], from: 0.3, to: 4.0, move: 1.3, maxZoom: 1.3 }]
  const Row: React.FC<{ at: number; who: string; says: string; tone: string }> = ({ at, who, says, tone }) => {
    const lit = interpolate(f, [at - 4, at + 12], [0.3, 1], CLAMP)
    return (
      <div style={{ opacity: lit, padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: tone }}>{who}</span>
        <span style={{ fontFamily: SERIF, fontSize: 30, color: TEXT }}>{says}</span>
      </div>
    )
  }
  return (
    <>
      <Backdrop />
      <Side
        eyebrow="The problem"
        lines={['Too small to litigate.', { em: 'Too big to walk away from.' }]}
        size={58}
        frame={<BrowserFrame shots={[{ clip: 'landing', startFrom: 0.3, path: '/' }]} width={SIDE_W} delay={4} dur={DURS[1]} focus={focus} pushIn={[1, 1.02]} />}
        foot={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Chip tone="bad" delay={tArb} block>$3,000+ · 6 to 12 weeks</Chip>
            <Chip tone="plain" delay={tSits}>The money just sits</Chip>
          </div>
        }
      >
        <Sfx name="tick" at={tContractor} />
        <Sfx name="tick" at={tClient} />
        <Sfx name="stamp" at={tArb} volume={0.4} />
        <Card delay={cue(1, 'money') + 2} pad={26} width={520}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.14em', textTransform: 'uppercase', color: FAINT }}>Escrow · locked</span>
            <span style={{ fontFamily: SERIF, fontSize: 40, color: TEXT }}>10,000 <span style={{ fontSize: 22, color: DIM }}>USDC</span></span>
          </div>
          <div style={{ height: 8 }} />
          <Hairline delay={cue(1, 'money') + 10} />
          <Row at={tContractor} who="Contractor" says="Delivered." tone={BRAND} />
          <Hairline delay={tClient - 8} />
          <Row at={tClient} who="Client" says="Never delivered." tone={BAD} />
        </Card>
      </Side>
    </>
  )
}

/* =================================================================== S02 == */
/* The bounded reasoning graph, drawn as the narration names each step. */

const NODES = [
  { id: 'screen', label: 'screen', sub: 'patterns + SERV', word: 'screened', det: false },
  { id: 'extract', label: 'extract_clauses', sub: 'SERV · strict schema', word: 'clauses', det: false },
  { id: 'evaluate', label: 'evaluate', sub: 'clause by clause', word: 'weighed', det: false },
  { id: 'adjudicate', label: 'adjudicate ×3', sub: 'consensus', word: 'three', det: false },
  { id: 'verify', label: 'verify', sub: 'deterministic', word: 'verifier', det: true },
]

const S02: React.FC = () => {
  const f = useCurrentFrame()
  const tGraph = cue(2, 'bounded')
  const tServ = cue(2, 'serv')
  const tPosted = cue(2, 'posted')
  const X0 = 130
  const GAP = 342
  const Y = 610
  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 110, top: 120, width: 1400 }}>
        <Eyebrow delay={2}>How it decides</Eyebrow>
        <div style={{ height: 22 }} />
        <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
          <Headline lines={['Not a prompt.']} delay={cue(2, 'prompt') - 6} size={78} />
          <Headline lines={[{ em: 'A bounded reasoning graph.' }]} delay={tGraph - 2} size={78} />
        </div>
        <div style={{ height: 18 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Rise delay={tServ} distance={8}><PartnerLogo name="openserv" size={44} /></Rise>
          <Chip tone="blue" delay={tServ + 2} size={20}>on the SERV reasoning API</Chip>
          <Chip tone="plain" delay={tServ + 10} size={20} mono>json_schema · strict</Chip>
        </div>
      </div>

      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        {NODES.slice(0, -1).map((n, i) => {
          const at = cue(2, NODES[i + 1].word) - 10
          const p = easeInOut(interpolate(f, [at, at + 18], [0, 1], CLAMP))
          const x1 = X0 + i * GAP + 312
          const x2 = X0 + (i + 1) * GAP
          return <line key={n.id} x1={x1} y1={Y} x2={x1 + (x2 - x1) * p} y2={Y} stroke={LINE_2} strokeWidth={2} />
        })}
        {/* Data moving along each edge once it is drawn. */}
        {NODES.slice(0, -1).map((n, i) => {
          const start = cue(2, NODES[i + 1].word) + 10
          if (f < start) return null
          const x1 = X0 + i * GAP + 312
          const x2 = X0 + (i + 1) * GAP
          const p = ((f - start) % 40) / 40
          return <rect key={`pk-${n.id}`} x={x1 + (x2 - x1 - 12) * p} y={Y - 3} width={12} height={6} fill={BRAND} opacity={0.9} />
        })}
        {/* The three adjudications, fanned. */}
        {[-1, 0, 1].map((k) => {
          const at = cue(2, 'three') + 4 + Math.abs(k) * 4
          const p = easeOut(interpolate(f, [at, at + 16], [0, 1], CLAMP))
          const x = X0 + 3 * GAP + 156
          return <circle key={k} cx={x + k * 34 * p} cy={Y - 82} r={8} fill={k === 0 ? BRAND : PAPER} stroke={BRAND} strokeWidth={2} opacity={p} />
        })}
      </svg>

      {NODES.map((n, i) => {
        const at = cue(2, n.word) - 6
        return (
          <div key={n.id} style={{ position: 'absolute', left: X0 + i * GAP, top: Y - 60 }}>
            <Card delay={at} pad={0} width={312} style={{ borderColor: n.det ? BRAND : LINE, boxShadow: n.det ? `${cardStyle.boxShadow}, 0 0 60px -20px ${BRAND}` : cardStyle.boxShadow }}>
              <div style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 9, height: 18, background: n.det ? BRAND : TEXT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 23, color: TEXT }}>{n.label}</div>
                  <div style={{ fontFamily: SANS, fontSize: 17, color: n.det ? BRAND : FAINT }}>{n.sub}</div>
                </div>
              </div>
            </Card>
          </div>
        )
      })}

      {NODES.map((n) => <Sfx key={n.id} name="tick" at={cue(2, n.word) - 4} />)}
      <Sfx name="chime" at={tPosted} volume={0.3} />
      <div style={{ position: 'absolute', left: 110, top: 800, width: 1700, display: 'flex', gap: 14 }}>
        <Chip tone="ok" delay={cue(2, 'weighed') + 8} block>Findings cite evidence by id</Chip>
        <Chip tone="ok" delay={cue(2, 'three') + 10} block>Confidence measured, never self-reported</Chip>
        <Chip tone="brand" delay={cue(2, 'verifier') + 4} block>Every citation resolved in plain code</Chip>
        <Chip tone="gold" delay={tPosted} block>Posted, not executed</Chip>
      </div>
    </>
  )
}

/* =================================================================== S03 == */
/* 01 · The sample case decided live. */

const S03: React.FC = () => {
  const feed = markOr('case', 'feed', [297, 408, 1270, 134], 3)
  const verdict = markOr('case', 'verdict', [296, 769, 1272, 808], 30)
  const tThirty = cueS(3, 'thirty')
  const tVerdict = cueS(3, 'verdict')
  const RATE_A = 1.3
  const focus: Focus[] = [
    { rect: [feed.rect[0], feed.rect[1] - 20, feed.rect[2], 520], from: 0.5, to: tThirty - 0.4, move: 1.2, maxZoom: 1.35 },
    { rect: [verdict.rect[0], verdict.rect[1], verdict.rect[2], 470], from: tVerdict - 0.2, to: 99, move: 1.1, maxZoom: 1.5 },
  ]
  return (
    <>
      <Backdrop />
      <Sfx name="tick" at={cue(3, 'seven')} />
      <Sfx name="chime" at={cue(3, 'verdict')} volume={0.3} />
      <Sfx name="tick" at={cue(3, 'confidence')} />
      <Wide
        step={1}
        eyebrow="Live on SERV"
        title="Seven typed steps stream in."
        title2="A verdict, with its price."
        swapAt={cue(3, 'verdict')}
        note={
          <>
            <Chip tone="ok" delay={cue(3, 'confidence')} size={18} block>Confidence measured across re-runs</Chip>
            <Chip tone="gold" delay={cue(3, 'cost')} size={18} mono><Count from={0} to={0.023} start={cue(3, 'cost')} dur={26} fmt={(n) => `$${n.toFixed(3)}`} /> per decision</Chip>
          </>
        }
        right={<Credit from={cue(3, 'seven')} name="The sample case" kicker="Decided live" role="A web contract, 10,000 USDC in escrow" logo="openserv" />}
        frame={
          <BrowserFrame
            width={WIDE_W} delay={2} dur={DURS[3]} pushIn={[1, 1.01]} focus={focus}
            shots={[
              { clip: 'case', startFrom: Math.max(0, feed.t - 2.4), playbackRate: RATE_A, path: '/app#dispute' },
              { clip: 'case', at: tThirty, startFrom: Math.max(0, verdict.t - 5.2), playbackRate: 1.15, path: '/app#dispute', dissolve: 10 },
            ]}
          />
        }
      />
    </>
  )
}

/* =================================================================== S04 == */
/* 02 · Tampered evidence, quarantined. */

const S04: React.FC = () => {
  const tick = markOr('poison', 'tick', [300, 260, 320, 30], 0.6)
  const flag = markOr('poison', 'flag', [313, 411, 1238, 121], 39)
  const verdict = markOr('poison', 'verdict', [296, 1272, 1272, 854], 34)
  const tHidden = cueS(4, 'hidden')
  const tQuar = cueS(4, 'quarantined')
  const tVerdict = cueS(4, 'verdict')
  const focus: Focus[] = [
    { rect: grow(tick.rect, 60, 60), from: 0.5, to: tHidden - 0.6, move: 1.1, maxZoom: 1.8 },
    { rect: grow(flag.rect, 30, 40), from: tQuar - 0.4, to: tVerdict - 0.8, move: 1.0, maxZoom: 1.7 },
    { rect: [verdict.rect[0], verdict.rect[1], verdict.rect[2], 300], from: tVerdict - 0.1, to: 99, move: 1.0, maxZoom: 1.6 },
  ]
  return (
    <>
      <Backdrop />
      <Sfx name="tick" at={cue(4, 'hidden')} />
      <Sfx name="stamp" at={cue(4, 'quarantined')} volume={0.45} />
      <Sfx name="tick" at={cue(4, 'verdict')} />
      <Wide
        step={2}
        eyebrow="Adversarial evidence"
        title="A hidden instruction in the evidence."
        title2="Quarantined. The verdict does not move."
        swapAt={cue(4, 'quarantined')}
        note={
          <>
            <Chip tone="bad" delay={cue(4, 'hidden')} size={18} mono>instruction_injection · high</Chip>
            <Chip tone="ok" delay={cue(4, 'quarantined') + 4} size={18} block>excluded before any step reads it</Chip>
          </>
        }
        right={<Credit from={cue(4, 'hostile')} name="Evidence guard" kicker="Deterministic first" role="Patterns that cannot be talked out of firing, then a model pass" />}
        frame={
          <BrowserFrame
            width={WIDE_W} delay={2} dur={DURS[4]} pushIn={[1, 1.01]} focus={focus}
            shots={[
              { clip: 'poison', startFrom: Math.max(0, tick.t - 0.7), playbackRate: 1.25, path: '/app#dispute' },
              { clip: 'poison', at: tQuar - 0.9, startFrom: Math.max(0, flag.t - 1.6), path: '/app#evidence', dissolve: 10 },
              { clip: 'poison', at: tVerdict - 0.3, startFrom: Math.max(0, verdict.t - 0.3), path: '/app#dispute', dissolve: 10 },
            ]}
          />
        }
      />
    </>
  )
}

/* =================================================================== S05 == */
/* 03 · The winner signs in; the vault waits; the agent pays. */

const S05: React.FC = () => {
  const wallet = markOr('case', 'wallet', [160, 657, 71, 31], 35)
  const countdown = markOr('case', 'countdown', [1350, 1500, 200, 40], 44)
  const release = markOr('case', 'release', [1350, 1500, 200, 40], 62)
  const paid = markOr('case', 'paid', [296, 1400, 1272, 220], 70)
  const tWallet = cueS(5, 'wallet')
  const tRefuses = cueS(5, 'refuses')
  const tPays = cueS(5, 'pays')
  const card: [number, number, number, number] = [Math.max(0, wallet.rect[0] - 140), Math.max(0, wallet.rect[1] - 150), 270, 320]
  const focus: Focus[] = [
    { rect: card, from: 0.4, to: tRefuses - 0.6, move: 1.1, maxZoom: 2.0 },
    { rect: grow(countdown.rect, 260, 120), from: tRefuses - 0.2, to: tPays - 0.6, move: 1.0, maxZoom: 1.9 },
    { rect: [paid.rect[0], paid.rect[1] - 10, paid.rect[2], Math.min(paid.rect[3] + 20, 330)], from: tPays + 0.9, to: 99, move: 1.0, maxZoom: 1.6 },
  ]
  return (
    <>
      <Backdrop />
      <Sfx name="tick" at={cue(5, 'wallet')} />
      <Sfx name="tick" at={cue(5, 'refuses')} />
      <Sfx name="chime" at={cue(5, 'pays') + 20} volume={0.32} />
      <Wide
        step={3}
        eyebrow="Settlement"
        title="A verdict moves no money by itself."
        title2="After the window, the agent pays. Real USDC."
        swapAt={cue(5, 'closes')}
        note={
          <>
            <Chip tone="brand" delay={cue(5, 'wallet')} size={18} block>Wallet as identity · proven by signature</Chip>
            <Chip tone="gold" delay={cue(5, 'refuses')} size={18}>Release refused until the window closes</Chip>
          </>
        }
        right={<Credit from={cue(5, 'coinbase')} name="Coinbase AgentKit" kicker="Escrow agent" role="A CDP wallet on Base mainnet sends the USDC" logo="coinbase" />}
        frame={
          <BrowserFrame
            width={WIDE_W} delay={2} dur={DURS[5]} pushIn={[1, 1.01]} focus={focus}
            shots={[
              { clip: 'case', startFrom: Math.max(0, wallet.t - 0.9), path: '/app#dispute' },
              { clip: 'case', at: tRefuses - 0.4, startFrom: Math.max(0, countdown.t - 0.2), path: '/app#dispute', dissolve: 10 },
              { clip: 'case', at: tPays - 0.5, startFrom: Math.max(0, release.t - 0.5), path: '/app#dispute', dissolve: 10 },
            ]}
          />
        }
      />
      <span style={{ display: 'none' }}>{tWallet}</span>
    </>
  )
}

/* =================================================================== S06 == */
/* Proof: the payout on Basescan. */

const S06: React.FC = () => {
  const tx = markOr('explorer', 'tx', [110, 330, 1380, 540], 0.8)
  const focus: Focus[] = [{ rect: [110, 300, 1380, 560], from: 0.5, to: 99, move: 1.3, maxZoom: 1.25 }]
  return (
    <>
      <Backdrop />
      <Sfx name="tick" at={cue(6, 'hash')} />
      <Wide
        step={4}
        eyebrow="On chain"
        title="A real transaction on Base mainnet."
        note={<Chip tone="ok" delay={cue(6, 'hash')} size={18} block>Hash on the case record and on Basescan</Chip>}
        right={<Credit from={cue(6, 'real')} name="Base mainnet" kicker="Explorer" role="USDC transfer from the escrow agent to the winner" logo="coinbase" />}
        frame={<BrowserFrame width={WIDE_W} delay={2} dur={DURS[6]} pushIn={[1, 1.01]} focus={focus} host="basescan.org" shots={[{ clip: hasClip('explorer') ? 'explorer' : 'case', startFrom: hasClip('explorer') ? 0.3 : 60, path: '/tx/…' }]} />}
      />
      <span style={{ display: 'none' }}>{tx.t}</span>
    </>
  )
}

/* =================================================================== S07 == */
/* 05 · Escrow that earns: the standing IXS position. */

const S07: React.FC = () => {
  const position = markOr('escrow', 'position', [942, 119, 626, 520], 0.9)
  const vaults = markOr('escrow', 'vaults', [943, 357, 624, 281], 7.6)
  const tReads = cueS(7, 'reads')
  const tHolds = cueS(7, 'holds')
  const tAvalanche = cueS(7, 'avalanche')
  const focus: Focus[] = [
    { rect: grow(position.rect, 20, 20), from: 0.4, to: tReads - 0.5, move: 1.1, maxZoom: 1.6 },
    { rect: grow(vaults.rect, 20, 30), from: tReads - 0.2, to: tHolds - 0.6, move: 1.0, maxZoom: 1.6 },
    { rect: grow(position.rect, 20, 20), from: tHolds - 0.2, to: tAvalanche - 0.6, move: 1.0, maxZoom: 1.6 },
    { rect: [110, 300, 1380, 560], from: tAvalanche, to: 99, move: 1.2, maxZoom: 1.25 },
  ]
  return (
    <>
      <Backdrop />
      <Sfx name="tick" at={cue(7, 'proposes')} />
      <Sfx name="tick" at={cue(7, 'policy')} />
      <Sfx name="chime" at={cue(7, 'holds')} volume={0.28} />
      <Sfx name="tick" at={cue(7, 'fee')} />
      <Side
        step={5}
        eyebrow="RWA Vaults · with IXS"
        lines={['Idle escrow is', 'dead capital.', { em: 'Judr puts it to work.' }]}
        size={56}
        frame={
          <BrowserFrame
            width={SIDE_W} delay={4} dur={DURS[7]} pushIn={[1, 1.02]} focus={focus}
            shots={[
              { clip: 'escrow', startFrom: 0.2, path: '/app#escrow' },
              { clip: 'escrow', at: tReads - 0.4, startFrom: Math.max(0, vaults.t - 0.3), path: '/app#escrow', dissolve: 10 },
              { clip: 'escrow', at: tHolds - 0.4, startFrom: 0.9, path: '/app#escrow', dissolve: 10 },
              { clip: 'snowscan', at: tAvalanche - 0.2, startFrom: 0.4, path: '/tx/0x1371…4c0c', host: 'snowscan.xyz', dissolve: 10 },
            ]}
          />
        }
        foot={<Credit from={cue(7, 'holds')} name="IX High Yield Bond (USDC)" kicker="Avalanche C-Chain" role="100 USDC requested by the agent · request 10" logo="ixs" />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <Chip tone="blue" delay={cue(7, 'proposes')} size={19}>A SERV step proposes</Chip>
          <Chip tone="brand" delay={cue(7, 'policy')} size={19} block>A deterministic policy decides</Chip>
          <Chip tone="gold" delay={cue(7, 'fee')} size={19}>Fee from yield only · principal untouched</Chip>
        </div>
      </Side>
    </>
  )
}

/* =================================================================== S08 == */
/* 06 · Bring your own dispute. */

const S08: React.FC = () => {
  const form = markOr('custom', 'form', [297, 172, 1270, 894], 0.7)
  const decide = markOr('custom', 'decide', [313, 977, 197, 42], 19.7)
  const RATE = 2.6
  const s = (c: number) => c / RATE
  const focus: Focus[] = [
    { rect: [form.rect[0], form.rect[1], form.rect[2], 560], from: 0.4, to: s(decide.t) - 0.8, move: 1.0, maxZoom: 1.3 },
    { rect: [decide.rect[0] - 60, decide.rect[1] - 380, 1000, 480], from: s(decide.t) - 0.5, to: 99, move: 1.0, maxZoom: 1.4 },
  ]
  return (
    <>
      <Backdrop />
      <Sfx name="tick" at={cue(8, 'decides')} />
      <Wide
        step={6}
        eyebrow="Your case"
        title="Paste a contract and the evidence."
        title2="Decided live, screening included."
        swapAt={cue(8, 'decides')}
        note={<Chip tone="plain" delay={cue(8, 'paste')} size={18} mono>up to 8 documents · 40,000 characters</Chip>}
        right={<Credit from={cue(8, 'bring')} name="Any dispute" kicker="Same graph" role="A photography contract, typed in and decided" />}
        frame={<BrowserFrame width={WIDE_W} delay={2} dur={DURS[8]} pushIn={[1, 1.01]} focus={focus} shots={[{ clip: 'custom', startFrom: 0.5, playbackRate: RATE, path: '/app#custom' }]} />}
      />
    </>
  )
}

/* =================================================================== S09 == */
/* Built with. */

const S09: React.FC = () => {
  const items: { logo: 'openserv' | 'coinbase' | 'ixs'; word: string; name: string; role: string }[] = [
    { logo: 'openserv', word: 'serv', name: 'SERV Reasoning API', role: 'Every step, strict JSON schema, streamed live' },
    { logo: 'coinbase', word: 'coinbase', name: 'Coinbase AgentKit', role: 'The escrow agent: a CDP wallet on Base mainnet' },
    { logo: 'ixs', word: 'ixs', name: 'IXS Vaults', role: 'Live vault list, a real position on Avalanche' },
  ]
  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 110, top: 130, width: 1700 }}>
        <Eyebrow delay={2}>Built with</Eyebrow>
        <div style={{ height: 22 }} />
        <Headline lines={['What is underneath.']} delay={6} size={78} />
      </div>
      {items.map((it) => <Sfx key={it.logo} name="rise" at={cue(9, it.word) - 4} volume={0.4} />)}
      <Sfx name="tick" at={cue(9, 'nothing')} />
      <div style={{ position: 'absolute', left: 110, top: 380, width: 1700, display: 'flex', gap: 26 }}>
        {items.map((it) => (
          <Card key={it.logo} delay={cue(9, it.word) - 4} pad={34} style={{ flex: 1 }}>
            <PartnerLogo name={it.logo} size={64} />
            <div style={{ height: 22 }} />
            <div style={{ fontFamily: SERIF, fontSize: 40, color: TEXT }}>{it.name}</div>
            <div style={{ height: 8 }} />
            <div style={{ fontFamily: SANS, fontSize: 21, color: DIM, lineHeight: 1.4 }}>{it.role}</div>
          </Card>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 110, top: 760, width: 1700, display: 'flex', gap: 14, alignItems: 'center' }}>
        <Rise delay={cue(9, 'every')} distance={8}><PartnerLogo name="opentrack" size={44} /></Rise>
        <Chip tone="plain" delay={cue(9, 'every') + 2} size={19}>Open Track · Coinbase AgentKit · IXS RWA Vaults</Chip>
        <Chip tone="ok" delay={cue(9, 'every') + 10} size={19} block>Every figure read live</Chip>
        <Chip tone="brand" delay={cue(9, 'nothing')} size={19} block>Nothing simulated</Chip>
      </div>
    </>
  )
}

/* =================================================================== S10 == */
/* Close. */

const S10: React.FC = () => {
  const tToo = cue(10, 'too', 0)
  const tToo2 = cue(10, 'too', 1)
  const tLive = cue(10, 'lyve')
  const tUrl = cue(10, 'try')
  return (
    <>
      <Backdrop tone="cover" />
      <InsetFrame delay={2} />
      <Sfx name="chime" at={tUrl} volume={0.3} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -40 }}>
          <Lockup height={120} delay={2} />
          <div style={{ height: 40 }} />
          <Hairline delay={tToo - 8} width={140} color="rgba(22,22,26,0.3)" />
          <div style={{ height: 30 }} />
          <Headline lines={['Too small to litigate.']} delay={tToo} size={64} align="center" />
          <Headline lines={[{ em: 'Too big to walk away from.' }]} delay={tToo2} size={64} align="center" />
          <div style={{ height: 44 }} />
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Chip tone="brand" delay={tUrl - 4} size={30} block>tryjudr.vercel.app</Chip>
            <Chip tone="plain" delay={tLive} size={21}>Base mainnet</Chip>
            <Chip tone="plain" delay={tLive + 5} size={21}>IXS position live</Chip>
            <Chip tone="plain" delay={tLive + 10} size={21}>SERV Hackathon · Edition 01</Chip>
          </div>
        </div>
      </AbsoluteFill>
    </>
  )
}

/* ================================================================ assembly == */

const BODIES: React.FC[] = [S00, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10]

const Scene: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const f = useCurrentFrame()
  const o = first ? 1 : interpolate(f, [0, FADE], [0, 1], CLAMP)
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}

/** The music bed: in over a second, held low under the voice, out over the last two. */
const Bed: React.FC = () => (
  <Audio
    src={staticFile('sfx/bed.mp3')}
    volume={(f) => interpolate(f, [0, 30, JUDR_DURATION - 70, JUDR_DURATION - 4], [0, 0.13, 0.13, 0], CLAMP)}
  />
)

export const Judr: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: SILK }}>
    <Bed />
    {BODIES.map((Body_, i) => (
      <Sequence key={IDS[i]} from={STARTS[i]} durationInFrames={DURS[i] + (i === BODIES.length - 1 ? 0 : FADE)} name={IDS[i]} premountFor={30}>
        <Scene first={i === 0}>
          <Body_ />
        </Scene>
        <Sequence from={LEAD} layout="none">
          <Audio src={staticFile(`vo/${IDS[i]}.mp3`)} volume={1.6} />
        </Sequence>
      </Sequence>
    ))}
    {STARTS.slice(1).map((s, i) => (
      <Sequence key={`wipe-${i}`} from={s - WIPE / 2} durationInFrames={WIPE} name={`wipe ${i + 1}`}>
        <BarWipe />
        <Audio src={staticFile('sfx/whoosh.mp3')} volume={0.42} />
      </Sequence>
    ))}
    <ProgressRail total={JUDR_DURATION} />
  </AbsoluteFill>
)

void [Body, Count, OK, LINE]
