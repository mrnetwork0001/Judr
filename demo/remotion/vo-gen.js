// Narration for the Judr demo, generated with ElevenLabs *with timestamps*, so every
// graphic in the film is cued to the word that names it rather than hand-timed.
//   node vo-gen.js              all sections
//   VO_ONLY=03 node vo-gen.js   one section
// Writes public/vo/vNN.mp3 and src/vo/vNN.json (word alignment).
// The key is read from an env file OUTSIDE this repo, so no secret is ever written here.
const fs = require('fs')
const ENV_FILES = [process.env.ELEVEN_ENV, '.env', '/Users/mrnetwork/Syntura/video/.env'].filter(Boolean)
for (const file of ENV_FILES) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const key = process.env.ELEVENLABS_API_KEY
if (!key) { console.error('No ELEVENLABS_API_KEY found. Set ELEVEN_ENV to an env file that has it.'); process.exit(1) }
const VOICE = process.env.ELEVENLABS_VOICE || 'CwhRBWXzGAHq8TQ4Fs17'
const MODEL = 'eleven_multilingual_v2'

// "lyve" is a spelling, not a word: it makes the voice say live as in alive, never
// as in leave. The on-screen text keeps the real spelling.
// Every figure spoken here is what the app showed on the day it was filmed: the
// sample case decided live on SERV for about two cents, a real USDC payout on Base
// mainnet, and a real 100 USDC position in IXS's vault on Avalanche.
const SECTIONS = [
  ['00', "Judr. Autonomous arbitration for tokenized real-world-asset escrow."],
  ['01', "Money is locked in escrow against a real obligation. The contractor says the work was delivered. The client says it wasn't. Arbitration costs more than the claim, so the dispute never gets resolved, and the money just sits."],
  ['02', "Judr decides it. Not with one prompt, but with a bounded reasoning graph on SERV. Evidence is screened. Clauses are extracted. Each side is weighed, clause by clause. The adjudication runs three times, and a deterministic verifier checks every citation before anything is posted."],
  ['03', "Here it is, lyve. Seven typed steps stream in, and about thirty seconds later there is a verdict. Who wins, which clauses decided it, a confidence measured across re-runs, and what the decision cost. About two cents."],
  ['04', "Evidence comes from the parties, so it is treated as hostile. This document carries a hidden instruction to rule for the defendant. It is quarantined before any reasoning step reads it, and the verdict does not move."],
  ['05', "A verdict moves no money by itself. The winner signs in with a wallet. The vault refuses to release until the appeal window closes. Then the escrow agent, a Coinbase AgentKit wallet on Base, pays the winner in real USDC."],
  ['06', "That is a real transaction on Base mainnet. The hash is on the case record, and on Basescan."],
  ['07', "While a dispute is open, the escrow should not sit idle. The agent reads IXS's lyve vault list, a SERV step proposes where the money should sit, a policy decides, and the agent holds a real position in IXS's high-yield bond vault on Avalanche. Judr's fee comes out of the yield, never out of principal."],
  ['08', "Bring your own dispute. Paste a contract and the evidence, and Judr decides it lyve, screening included."],
  ['09', "Built on the SERV reasoning API, Coinbase AgentKit, and IXS vaults. Every figure on screen is read lyve. Nothing is simulated."],
  ['10', "Judr. Too small to litigate. Too big to walk away from. Lyve now, at try judr dot vercel dot app."],
]

const AUDIO_DIR = process.env.AUDIO_DIR || 'public/vo'
const ALIGN_DIR = process.env.ALIGN_DIR || 'src/vo'
const only = process.env.VO_ONLY ? process.env.VO_ONLY.replace(/^v/, '') : null
const todo = SECTIONS.filter(([id]) => !only || id === only)
console.log('characters:', todo.reduce((n, s) => n + s[1].length, 0), 'in', todo.length, 'sections')
fs.mkdirSync(AUDIO_DIR, { recursive: true })
fs.mkdirSync(ALIGN_DIR, { recursive: true })

;(async () => {
  for (const [id, text] of todo) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text, model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
      }),
    })
    if (!res.ok) { console.error(`v${id}: ${res.status} ${(await res.text()).slice(0, 200)}`); continue }
    const body = await res.json()
    const buf = Buffer.from(body.audio_base64, 'base64')
    fs.writeFileSync(`${AUDIO_DIR}/v${id}.mp3`, buf)
    const a = body.alignment
    const words = []
    let cur = null
    a.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null } return }
      if (!cur) cur = { w: '', s: a.character_start_times_seconds[i], e: 0 }
      cur.w += ch
      cur.e = a.character_end_times_seconds[i]
    })
    if (cur) words.push(cur)
    fs.writeFileSync(`${ALIGN_DIR}/v${id}.json`, JSON.stringify({ text, words }, null, 0) + '\n')
    console.log(`${id}: ${(buf.length / 1024).toFixed(0)}kb, ${words.length} words, ends ${words.at(-1).e.toFixed(2)}s`)
  }
  const total = fs.readdirSync(ALIGN_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(`${ALIGN_DIR}/${f}`, 'utf8')).words.at(-1).e).reduce((a, b) => a + b, 0)
  console.log(`total speech: ${total.toFixed(1)}s`)
})()
