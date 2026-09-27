/**
 * The film's wallet. A throwaway key lives here in node; the page gets an EIP-1193
 * provider (scripts/wallet-inject.mjs) that routes personal_sign to this server, so
 * the app sees a real wallet and every signature is real. The key is written to
 * clips/tmp/demo-wallet.json (ignored by git) so the address survives a restart and
 * the explorer beat can find it.
 *   node scripts/signer.mjs      # port 8976
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'clips/tmp/demo-wallet.json')
fs.mkdirSync(path.dirname(FILE), { recursive: true })
let pk = process.env.DEMO_PK
if (!pk && fs.existsSync(FILE) && !process.env.FRESH) pk = JSON.parse(fs.readFileSync(FILE, 'utf8')).privateKey
if (!pk) pk = generatePrivateKey()
const account = privateKeyToAccount(pk)
fs.writeFileSync(FILE, JSON.stringify({ address: account.address, privateKey: pk }, null, 2), { mode: 0o600 })
console.log('demo wallet:', account.address)

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); res.end(JSON.stringify(body)) }
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'GET' && req.url === '/address') return json(res, 200, { address: account.address })
  if (req.method === 'POST' && req.url === '/sign') {
    let body = ''
    for await (const chunk of req) body += chunk
    try {
      const { message } = JSON.parse(body)
      const signature = await account.signMessage({ message })
      console.log('signed:', message.split('\n')[0])
      return json(res, 200, { signature })
    } catch (e) { return json(res, 400, { error: String(e) }) }
  }
  json(res, 404, { error: 'not found' })
}).listen(Number(process.env.SIGNER_PORT || 8976), '127.0.0.1', () => console.log('signer on http://127.0.0.1:' + (process.env.SIGNER_PORT || 8976)))
