import React from 'react'
import { AbsoluteFill, Freeze, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { loadFont as loadInstrument } from '@remotion/google-fonts/InstrumentSerif'
import { loadFont as loadGeist } from '@remotion/google-fonts/Geist'
import { loadFont as loadGeistMono } from '@remotion/google-fonts/GeistMono'
import clipManifest from './clips.json'

/**
 * Shared furniture for the Judr film.
 *
 * Judr reads like a well-set legal document on pale silk, so the film is set the
 * same way: the app's own light stock with a slow sheen, Instrument Serif for the
 * headlines with the one phrase that carries the point in the app's gold italic,
 * Geist for body and Geist Mono for figures, hairline rules, and the mark's two
 * elements, black bars and one green block, as the only ornament. Motion is
 * unhurried: type is uncovered from its own baseline, rules draw themselves,
 * cards rise a short way and settle.
 */

/* ------------------------------------------------------------------ palette */

export const SILK = '#f1f1f3'
export const SILK_2 = '#e7e7ec'
export const PAPER = '#ffffff'
export const LINE = 'rgba(22,22,26,0.10)'
export const LINE_2 = 'rgba(22,22,26,0.18)'
export const TEXT = '#16161a'
export const DIM = '#54545f'
export const FAINT = '#8b8b97'
export const BRAND = '#2a4739'
export const BRAND_TINT = 'rgba(42,71,57,0.10)'
export const GOLD = '#8a5c0c'
export const GOLD_TINT = 'rgba(138,92,12,0.10)'
export const OK = '#1e7a4c'
export const OK_TINT = 'rgba(30,122,76,0.10)'
export const BAD = '#b3261e'
export const BAD_TINT = 'rgba(179,38,30,0.09)'
export const BLUE = '#2b5bd7'
export const BLUE_TINT = 'rgba(43,91,215,0.10)'

/* -------------------------------------------------------------------- fonts */

const instrument = loadInstrument('normal', { weights: ['400'], subsets: ['latin'] })
loadInstrument('italic', { weights: ['400'], subsets: ['latin'] })
const geist = loadGeist('normal', { weights: ['400', '500', '600'], subsets: ['latin'] })
const mono = loadGeistMono('normal', { weights: ['400', '500'], subsets: ['latin'] })

export const SERIF = `${instrument.fontFamily}, Georgia, serif`
export const SANS = `${geist.fontFamily}, system-ui, sans-serif`
export const MONO = `${mono.fontFamily}, ui-monospace, monospace`

/* ------------------------------------------------------------------- motion */

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

export const useProgress = (delay = 0, dur = 22) => {
  const f = useCurrentFrame()
  return easeOut(interpolate(f, [delay, delay + dur], [0, 1], CLAMP))
}

export const useRise = (delay = 0, distance = 22, out?: number) => {
  const f = useCurrentFrame()
  const pin = easeOut(interpolate(f, [delay, delay + 22], [0, 1], CLAMP))
  const pout = out === undefined ? 0 : easeInOut(interpolate(f, [out, out + 14], [0, 1], CLAMP))
  return { opacity: pin * (1 - pout), transform: `translateY(${(1 - pin) * distance - pout * 12}px)` }
}

export const Rise: React.FC<{ children: React.ReactNode; delay?: number; distance?: number; out?: number; style?: React.CSSProperties }> = ({
  children, delay = 0, distance = 22, out, style,
}) => <div style={{ ...useRise(delay, distance, out), ...style }}>{children}</div>

export const Hairline: React.FC<{ delay?: number; width?: number | string; color?: string; weight?: number; out?: number; origin?: 'left' | 'right' }> = ({
  delay = 0, width = '100%', color = LINE_2, weight = 1.5, out, origin = 'left',
}) => {
  const f = useCurrentFrame()
  const p = easeInOut(interpolate(f, [delay, delay + 26], [0, 1], CLAMP))
  const o = out === undefined ? 1 : 1 - interpolate(f, [out, out + 14], [0, 1], CLAMP)
  return <div style={{ width, height: weight, background: color, opacity: o, transform: `scaleX(${p})`, transformOrigin: `${origin} center` }} />
}

export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; dur?: number; from?: 'below' | 'above'; out?: number; style?: React.CSSProperties }> = ({
  children, delay = 0, dur = 24, from = 'below', out, style,
}) => {
  const f = useCurrentFrame()
  const pin = easeOut(interpolate(f, [delay, delay + dur], [0, 1], CLAMP))
  const pout = out === undefined ? 0 : easeInOut(interpolate(f, [out, out + 16], [0, 1], CLAMP))
  const sign = from === 'below' ? 1 : -1
  return (
    <div style={{ overflow: 'hidden', paddingBottom: 6, marginBottom: -6, ...style }}>
      <div style={{ transform: `translateY(${((1 - pin) * 104 + pout * 104) * sign}%)`, opacity: Math.min(1, pin * 3) }}>{children}</div>
    </div>
  )
}

export const Count: React.FC<{ from: number; to: number; start: number; dur?: number; fmt: (n: number) => string; style?: React.CSSProperties }> = ({
  from, to, start, dur = 40, fmt, style,
}) => {
  const f = useCurrentFrame()
  const p = easeInOut(interpolate(f, [start, start + dur], [0, 1], CLAMP))
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{fmt(from + (to - from) * p)}</span>
}

/* ----------------------------------------------------------------- backdrop */

/** Pale silk with a slow sheen sweep, a faint paper grain, and the app's light gradient. */
export const Backdrop: React.FC<{ tone?: 'silk' | 'cover' }> = ({ tone = 'silk' }) => {
  const f = useCurrentFrame()
  const sweep = ((f / 420) % 1) * 160 - 30
  const cover = tone === 'cover'
  return (
    <AbsoluteFill style={{ background: cover ? '#ececf0' : SILK }}>
      <AbsoluteFill style={{ background: `linear-gradient(160deg, rgba(255,255,255,${cover ? 0.9 : 0.75}) 0%, rgba(255,255,255,0) 55%, rgba(220,220,228,${cover ? 0.6 : 0.45}) 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(105deg, rgba(255,255,255,0) ${sweep - 18}%, rgba(255,255,255,0.55) ${sweep}%, rgba(255,255,255,0) ${sweep + 18}%)` }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(22,22,26,0.045) 1px, transparent 1.4px)', backgroundSize: '26px 26px', opacity: 0.8 }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 62%, rgba(0,0,0,0.06) 100%)' }} />
    </AbsoluteFill>
  )
}

/* --------------------------------------------------------------------- type */

export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number; color?: string; size?: number; out?: number }> = ({
  children, delay = 0, color = BRAND, size = 19, out,
}) => (
  <div style={{ ...useRise(delay, 12, out), fontFamily: MONO, fontSize: size, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap', color }}>
    {children}
  </div>
)

export type HeadLine = string | { em: string }
/** Serif headline; a line given as { em } is set in the app's gold italic. */
export const Headline: React.FC<{ lines: HeadLine[]; delay?: number; size?: number; stagger?: number; out?: number; align?: 'left' | 'center'; emColor?: string }> = ({
  lines, delay = 0, size = 72, stagger = 6, out, align = 'left', emColor = GOLD,
}) => (
  <div style={{ fontFamily: SERIF, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.015em', fontWeight: 400, color: TEXT, textAlign: align }}>
    {lines.map((l, i) => (
      <Reveal key={i} delay={delay + i * stagger} out={out} style={{ paddingBottom: size * 0.18, marginBottom: -size * 0.18 }}>
        {typeof l === 'string' ? <span>{l}</span> : <span style={{ fontStyle: 'italic', color: emColor }}>{l.em}</span>}
      </Reveal>
    ))}
  </div>
)

export const Body: React.FC<{ children: React.ReactNode; delay?: number; size?: number; color?: string; width?: number; out?: number }> = ({
  children, delay = 0, size = 26, color = DIM, width = 520, out,
}) => <div style={{ ...useRise(delay, 16, out), fontFamily: SANS, fontSize: size, lineHeight: 1.45, color, maxWidth: width }}>{children}</div>

export const StepNumber: React.FC<{ n: number; delay?: number; size?: number; out?: number }> = ({ n, delay = 0, size = 104, out }) => (
  <Reveal delay={delay} out={out}>
    <div style={{ fontFamily: SERIF, fontSize: size, lineHeight: 0.95, letterSpacing: '-0.02em', color: GOLD, fontFeatureSettings: '"lnum" 1' }}>
      {String(n).padStart(2, '0')}
    </div>
  </Reveal>
)

/* -------------------------------------------------------------------- brand */

/**
 * The mark, drawn: four bars grow from the left in turn, then the green block
 * drops into its place. Sized by `height`; the geometry is the favicon's.
 */
export const Mark: React.FC<{ height?: number; delay?: number; color?: string }> = ({ height = 64, delay = 0, color = TEXT }) => {
  const f = useCurrentFrame()
  const u = height / 16
  const bars: [number, number, number][] = [[1, 2, 14], [1, 6, 9], [1, 10, 9], [1, 14, 14]]
  const block = easeOut(interpolate(f, [delay + 22, delay + 40], [0, 1], CLAMP))
  return (
    <svg width={height} height={height} viewBox="0 0 16 16" style={{ display: 'block' }}>
      {bars.map(([x, y, w], i) => {
        const p = easeInOut(interpolate(f, [delay + i * 5, delay + i * 5 + 16], [0, 1], CLAMP))
        return <rect key={i} x={x} y={y} width={w * p} height={2} fill={color} />
      })}
      <rect x={12} y={6 + (1 - block) * -4} width={3} height={6} fill={BRAND} opacity={block} />
      <rect x={0} y={0} width={16} height={16} fill="none" style={{ display: 'none' }} />
      <text style={{ display: 'none' }}>{u}</text>
    </svg>
  )
}

/** The wordmark image (bars, block and the serif word), uncovered left to right. */
export const Lockup: React.FC<{ height?: number; delay?: number }> = ({ height = 120, delay = 0 }) => {
  const f = useCurrentFrame()
  const p = easeInOut(interpolate(f, [delay, delay + 34], [0, 1], CLAMP))
  const w = (height * 720) / 202
  return (
    <div style={{ width: w, height, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, opacity: Math.min(1, p * 2) }}>
      <Img src={staticFile('brand/judr-header.png')} style={{ width: w, height, display: 'block' }} />
    </div>
  )
}

export const PartnerLogo: React.FC<{ name: 'openserv' | 'coinbase' | 'ixs' | 'opentrack'; size?: number; style?: React.CSSProperties }> = ({ name, size = 56, style }) => (
  <Img src={staticFile(`partners/${name}.png`)} style={{ width: size, height: size, borderRadius: size * 0.22, display: 'block', boxShadow: '0 6px 18px -8px rgba(0,0,0,0.35)', ...style }} />
)

/* -------------------------------------------------------------- small parts */

export const cardStyle: React.CSSProperties = {
  background: PAPER,
  border: `1.5px solid ${LINE}`,
  borderRadius: 18,
  boxShadow: '0 30px 60px -36px rgba(20,20,30,0.28), 0 4px 14px -8px rgba(20,20,30,0.18)',
}

export const Card: React.FC<{ children: React.ReactNode; delay?: number; pad?: number; width?: number | string; out?: number; style?: React.CSSProperties; distance?: number }> = ({
  children, delay = 0, pad = 30, width, out, style, distance = 22,
}) => <div style={{ ...useRise(delay, distance, out), ...cardStyle, width, padding: pad, ...style }}>{children}</div>

const TONES = {
  brand: { bg: BRAND_TINT, fg: BRAND },
  gold: { bg: GOLD_TINT, fg: GOLD },
  ok: { bg: OK_TINT, fg: OK },
  bad: { bg: BAD_TINT, fg: BAD },
  blue: { bg: BLUE_TINT, fg: BLUE },
  plain: { bg: 'rgba(22,22,26,0.06)', fg: DIM },
} as const
export type Tone = keyof typeof TONES

export const Chip: React.FC<{ children: React.ReactNode; tone?: Tone; delay?: number; size?: number; block?: boolean; out?: number; mono?: boolean }> = ({
  children, tone = 'brand', delay = 0, size = 20, block, out, mono,
}) => {
  const t = TONES[tone]
  return (
    <span
      style={{
        ...useRise(delay, 10, out),
        display: 'inline-flex', alignItems: 'center', gap: size * 0.45, fontFamily: mono ? MONO : SANS, fontSize: size, fontWeight: 500,
        lineHeight: 1, color: t.fg, background: t.bg, border: `1px solid ${t.fg}33`, borderRadius: 999, padding: `${size * 0.44}px ${size * 0.74}px`, whiteSpace: 'nowrap',
      }}
    >
      {block && <span style={{ width: size * 0.32, height: size * 0.5, background: t.fg }} />}
      {children}
    </span>
  )
}

/** Lower third: a rule draws, the name rises out from behind it, the role drops from under it. */
export const Credit: React.FC<{ name: string; role: string; kicker: string; from?: number; width?: number; logo?: 'openserv' | 'coinbase' | 'ixs' | 'opentrack' }> = ({ name, role, kicker, from = 0, width = 540, logo }) => {
  const f = useCurrentFrame()
  if (f < from - 1) return null
  return (
    <div style={{ width, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      {logo && <Rise delay={from + 6} distance={10}><PartnerLogo name={logo} size={54} /></Rise>}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20 }}>
          <Reveal delay={from + 8}>
            <div style={{ fontFamily: SERIF, fontSize: 38, color: TEXT, lineHeight: 1.12, whiteSpace: 'nowrap' }}>{name}</div>
          </Reveal>
          <Reveal delay={from + 14}>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND, whiteSpace: 'nowrap' }}>{kicker}</div>
          </Reveal>
        </div>
        <div style={{ height: 10 }} />
        <Hairline delay={from} color={BRAND} weight={1.5} />
        <div style={{ height: 10 }} />
        <Reveal delay={from + 14} from="above">
          <div style={{ fontFamily: SANS, fontSize: 21, lineHeight: 1.3, color: DIM, whiteSpace: 'nowrap' }}>{role}</div>
        </Reveal>
      </div>
    </div>
  )
}

export const ProgressRail: React.FC<{ total: number }> = ({ total }) => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(22,22,26,0.06)' }} />
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${(f / Math.max(1, total - 1)) * 100}%`, background: BRAND }} />
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------ browser frame */

export const SRC_W = 1600
export const SRC_H = 900

export type Focus = { rect: [number, number, number, number]; from: number; to: number; move?: number; maxZoom?: number }
export type Shot = { clip: string; at?: number; startFrom?: number; playbackRate?: number; freeze?: boolean; path?: string; dissolve?: number; host?: string }

type Cam = { cx: number; cy: number; z: number }
const FULL: Cam = { cx: SRC_W / 2, cy: SRC_H / 2, z: 1 }

const camFor = (fo: Focus, zCap: number): Cam => {
  const [x, y, w, h] = fo.rect
  const z = Math.max(1, Math.min(fo.maxZoom ?? 2.4, zCap, Math.min(SRC_W / w, SRC_H / h) * 0.9))
  const half = { w: SRC_W / 2 / z, h: SRC_H / 2 / z }
  return { z, cx: Math.min(SRC_W - half.w, Math.max(half.w, x + w / 2)), cy: Math.min(SRC_H - half.h, Math.max(half.h, y + h / 2)) }
}

const cameraAt = (t: number, focus: Focus[], zCap: number): Cam => {
  const sorted = [...focus].sort((a, b) => a.from - b.from)
  const open = sorted[0] && sorted[0].from <= 0 ? camFor(sorted[0], zCap) : FULL
  const keys: { t: number; c: Cam }[] = [{ t: 0, c: open }]
  sorted.forEach((fo, i) => {
    const move = fo.move ?? 1.1
    const last = keys[keys.length - 1]
    keys.push({ t: Math.max(fo.from, last.t), c: last.c })
    keys.push({ t: Math.max(fo.from, last.t) + move, c: camFor(fo, zCap) })
    keys.push({ t: Math.max(fo.to, fo.from + move), c: camFor(fo, zCap) })
    const next = sorted[i + 1]
    if (!next || next.from > fo.to + move) keys.push({ t: fo.to + move, c: FULL })
  })
  for (let i = keys.length - 1; i >= 0; i--) {
    if (t >= keys[i].t) {
      const a = keys[i]
      const b = keys[i + 1]
      if (!b || b.t === a.t) return a.c
      const p = easeInOut(Math.min(1, (t - a.t) / (b.t - a.t)))
      return { cx: a.c.cx + (b.c.cx - a.c.cx) * p, cy: a.c.cy + (b.c.cy - a.c.cy) * p, z: a.c.z + (b.c.z - a.c.z) * p }
    }
  }
  return FULL
}

type ClipInfo = { duration: number; width: number; marks?: { name: string; t: number; rect: [number, number, number, number] }[] }
const manifest = clipManifest as unknown as Record<string, ClipInfo>

export const mark = (clip: string, name: string) => {
  const m = manifest[clip]?.marks?.find((x) => x.name === name)
  if (!m) throw new Error(`no mark ${clip}.${name}`)
  return m
}
export const hasClip = (clip: string) => Boolean(manifest[clip])
export const clipLength = (clip: string) => manifest[clip]?.duration ?? 0

const ShotVideo: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rate = shot.playbackRate ?? 1
  const start = shot.startFrom ?? 0
  const length = manifest[shot.clip]?.duration ?? 0
  const lastFrame = Math.max(0, Math.floor(((length - start) / rate - 0.25) * fps))
  return (
    <Freeze frame={shot.freeze ? 0 : Math.min(f, lastFrame)}>
      <OffthreadVideo src={staticFile(`clips/${shot.clip}.mp4`)} startFrom={Math.round(start * fps)} playbackRate={rate} muted style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
    </Freeze>
  )
}

/** A quiet light browser window around the footage, with a virtual camera over the 1600x900 page. */
export const BrowserFrame: React.FC<{ shots: Shot[]; width?: number; delay?: number; dur?: number; pushIn?: [number, number]; focus?: Focus[]; host?: string }> = ({
  shots, width = 1260, delay = 0, dur = 360, pushIn = [1, 1.03], focus = [], host = 'tryjudr.vercel.app',
}) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = easeOut(interpolate(f, [delay, delay + 26], [0, 1], CLAMP))
  const push = interpolate(f, [0, dur], pushIn, CLAMP)
  const BAR = 46
  const vw = width
  const vh = (width * SRC_H) / SRC_W
  const k = vw / SRC_W
  const zCap = 2.1 / (k * pushIn[1])
  const cam = cameraAt(f / fps, focus, zCap)
  const tx = vw / 2 - cam.cx * k * cam.z
  const ty = vh / 2 - cam.cy * k * cam.z
  const cuts = shots.map((sh) => Math.round((sh.at ?? 0) * fps))
  let active = 0
  cuts.forEach((c, i) => { if (f >= c) active = i })
  const shownHost = shots[active]?.host ?? host

  return (
    <div
      style={{
        width, opacity: enter, transform: `translateY(${(1 - enter) * 34}px) scale(${push})`, borderRadius: 16, overflow: 'hidden', background: PAPER,
        border: `1.5px solid ${LINE_2}`, boxShadow: '0 60px 120px -50px rgba(20,20,30,0.45), 0 24px 48px -30px rgba(20,20,30,0.3)',
      }}
    >
      <div style={{ height: BAR, display: 'flex', alignItems: 'center', padding: '0 18px', background: '#f6f6f8', borderBottom: `1.5px solid ${LINE}`, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 9 }}>
          {['#e5735f', '#e8b64a', '#5cc07a'].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c, opacity: 0.85 }} />)}
        </div>
        <div
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', height: 32, minWidth: 460, padding: '0 20px', borderRadius: 99,
            background: PAPER, border: `1.5px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: MONO, fontSize: 17, color: DIM,
          }}
        >
          <svg width="12" height="14" viewBox="0 0 13 15" fill="none"><rect x="1" y="6.4" width="11" height="7.6" rx="2" fill={BRAND} /><path d="M3.6 6.4V4.3a2.9 2.9 0 015.8 0v2.1" stroke={BRAND} strokeWidth="1.6" /></svg>
          <span>{shownHost}<span style={{ color: FAINT }}>{shots[active]?.path ?? ''}</span></span>
        </div>
      </div>
      <div style={{ width: vw, height: vh, position: 'relative', overflow: 'hidden', background: SILK }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: vw, height: vh, transform: `translate(${tx}px, ${ty}px) scale(${cam.z})`, transformOrigin: '0 0' }}>
          {shots.map((sh, i) => {
            const from = cuts[i]
            const fade = i === 0 ? 0 : sh.dissolve ?? 8
            const until = i + 1 < shots.length ? cuts[i + 1] + (shots[i + 1].dissolve ?? 8) : Infinity
            if (f < from || f > until) return null
            const o = fade <= 0 ? 1 : interpolate(f, [from, from + fade], [0, 1], CLAMP)
            return (
              <AbsoluteFill key={`${sh.clip}-${i}`} style={{ opacity: o }}>
                <Sequence from={from} layout="none">
                  <ShotVideo shot={sh} />
                </Sequence>
              </AbsoluteFill>
            )
          })}
        </div>
      </div>
    </div>
  )
}
