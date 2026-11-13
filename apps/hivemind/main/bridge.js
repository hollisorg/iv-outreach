// Loopback bridge between Hivemind's chat tools and its main process (same pattern as IV Outreach's visual guidance
// bridge). Only the MCP server Hivemind starts for its own chat gets the token. Fixed operations, small JSON bodies.
import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'

export const BRIDGE_OPERATIONS = ['find', 'reopen']

export async function startBridge(operations) {
  const token = randomBytes(32).toString('hex')
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    const got = Buffer.from(req.headers.authorization || '')
    const want = Buffer.from(`Bearer ${token}`)
    if (req.method !== 'POST' || req.headers.origin || got.length !== want.length || !timingSafeEqual(got, want)) {
      res.writeHead(403)
      res.end('{"error":"Not authorized"}')
      return
    }
    try {
      const operation = req.url.slice(1)
      if (!BRIDGE_OPERATIONS.includes(operation)) throw new Error('Unknown Hivemind operation.')
      let body = ''
      for await (const chunk of req) {
        body += chunk.toString('utf8')
        if (body.length > 4096) throw new Error('Request too large.')
      }
      const args = JSON.parse(body || '{}')
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Send an object.')
      res.end(JSON.stringify(await operations[operation](args)))
    } catch (error) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: error.message }))
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    token,
    url: `http://127.0.0.1:${server.address().port}`,
    close() { server.close(); server.closeAllConnections() },
  }
}

export async function callBridge(operation, args = {}, env = process.env) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(env.HIVEMIND_BRIDGE_URL || '') || !/^[a-f0-9]{64}$/.test(env.HIVEMIND_BRIDGE_TOKEN || '')) {
    throw new Error('These tools work inside Hivemind chat. Open Hivemind and ask there.')
  }
  if (!BRIDGE_OPERATIONS.includes(operation)) throw new Error('Unknown Hivemind operation.')
  const response = await fetch(`${env.HIVEMIND_BRIDGE_URL}/${operation}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${env.HIVEMIND_BRIDGE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Hivemind could not do that.')
  return value
}
