# Judr demo video

A 2m24s demo, rendered with [Remotion](https://remotion.dev) from real recordings of the
app at tryjudr.vercel.app. Nothing in the footage is a mockup: the sample case is decided
live on SERV while the camera rolls, the wallet sign-in is a real signature, the payout is a
real USDC transfer on Base mainnet, and the IXS position is read from the chain.

## How it fits together

| Stage | Command | What it does |
|---|---|---|
| Narration | `npm run vo` | Eleven lines to ElevenLabs with word timestamps, written to `public/vo/` and `src/vo/`. Two words are respelled for the voice only: "lyve" so that live is said as in alive. The key is read from an env file outside this repo, never committed. |
| Sound | `public/sfx/` | A whoosh for each bar-wipe transition, ticks, a chime and a stamp cued to the narration, and a 150-second music bed, all generated with ElevenLabs' sound and music endpoints. |
| Wallet | `npm run signer` | Makes a throwaway key for the film and writes its address to `clips/tmp/`. Signing happens inside the capture through a Playwright binding; the key never enters the page. |
| Capture | `npm run capture` | Drives the live app with Playwright one beat at a time into `public/clips/`, recording where every named element sat and when. `BEAT=case npm run capture` records one beat. |
| Render | `npm run render` | 1920x1080 H.264 to `out/judr-demo.mp4`, then loudness to -14 LUFS. |

## The beats

`landing` the hero replaying a real decision · `case` the sample case decided live, the
winner signs in, the window closes, the agent pays · `poison` tampered evidence quarantined
· `explorer` the payout on Basescan · `escrow` the standing IXS position and the live vault
list · `snowscan` the position's request on Snowscan · `custom` a visitor's own dispute typed
in and decided.

Every graphic is cued to the word in the narration that names it (`cue()` in
`src/Judr.tsx`), and the browser camera is aimed at the rectangles the capture recorded,
so re-recording a line or a beat re-times the film without hand editing.

## Running it

```bash
npm install
npm run vo                     # once, or after editing narration
npm run signer &               # the film's wallet
npm run capture                # against https://tryjudr.vercel.app by default; APP_URL= to change
npm run clips && npm run render
```

The `case` beat pays real money: 0.10 USDC from the escrow agent to the film's wallet.
