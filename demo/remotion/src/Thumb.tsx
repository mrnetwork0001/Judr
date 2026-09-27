import React from 'react'
import { AbsoluteFill } from 'remotion'
import { BRAND, Backdrop, BrowserFrame, Chip, DIM, Focus, GOLD, Headline, Lockup, MONO, PartnerLogo, SANS, SERIF, TEXT, mark } from './ui'

/**
 * The YouTube thumbnail: the film's own furniture, held on one frame. Type is
 * set large enough to read at 320px wide, and the app is shown on the verdict.
 */
export const Thumb: React.FC = () => {
  // The moment the verdict is posted and the vault is counting down to release.
  const countdown = mark('case', 'countdown')
  const focus: Focus[] = [{ rect: [300, 110, 1270, 600], from: 0, to: 99, move: 0.01, maxZoom: 1.3 }]
  return (
    <AbsoluteFill>
      <Backdrop tone="cover" />
      <div style={{ position: 'absolute', left: 96, top: 84, width: 940 }}>
        <Lockup height={96} delay={-60} />
        <div style={{ height: 46 }} />
        <Headline lines={['Too small', 'to litigate.', { em: 'Too big to' }, { em: 'walk away from.' }]} delay={-60} size={104} stagger={0} />
        <div style={{ height: 34 }} />
        <div style={{ fontFamily: SANS, fontSize: 29, color: DIM, lineHeight: 1.35, maxWidth: 820 }}>
          Decides escrow disputes for two cents, waits for an appeal, then pays the winner on-chain.
        </div>
        <div style={{ height: 30 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Chip tone="brand" delay={-60} size={23} block>Real USDC on Base mainnet</Chip>
          <Chip tone="gold" delay={-60} size={23}>Live on SERV</Chip>
          <Chip tone="plain" delay={-60} size={23}>IXS vault position</Chip>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 70, top: 130, width: 880, transform: 'rotate(-2.5deg)' }}>
        <BrowserFrame shots={[{ clip: 'case', startFrom: Math.max(0, countdown.t - 0.1), freeze: true, path: '/app#dispute' }]} width={880} delay={-60} dur={1} pushIn={[1, 1]} focus={focus} />
      </div>
      <div style={{ position: 'absolute', left: 96, bottom: 52, display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND }}>Built with</span>
        <PartnerLogo name="openserv" size={52} />
        <PartnerLogo name="coinbase" size={52} />
        <PartnerLogo name="ixs" size={52} />
        <span style={{ fontFamily: SERIF, fontSize: 26, color: TEXT, marginLeft: 8 }}>OpenServ SERV Hackathon · Edition 01</span>
      </div>
      <span style={{ display: 'none', color: GOLD }} />
    </AbsoluteFill>
  )
}
