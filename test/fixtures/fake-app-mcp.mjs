// A stand-in IV app tool server for Hivemind's router tests: the same stdio protocol and ask-file rule as the apps'
// own chat mode (IV Signal's names). signal_archive_post asks first, like the real one.
import { createInterface } from 'node:readline'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ask = process.env.IV_SIGNAL_AGENT_ASK
const tools = [
  { name: 'signal_list_brands', description: 'Every brand in IV Signal.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'signal_draft_post', description: 'Draft a post for a brand.', inputSchema: { type: 'object', properties: { brand_id: { type: 'string' }, idea: { type: 'string' } } } },
  { name: 'signal_archive_post', description: 'Archive or restore a post.', inputSchema: { type: 'object', properties: { post_id: { type: 'string' } } } },
  { name: 'signal_show_in_app', description: 'Point at a control in the window.', inputSchema: { type: 'object', properties: {} } },
]
const write = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
async function askPerson(name, why) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const file = join(ask, `${id}.ask.json`)
  const answer = join(ask, `${id}.answer.json`)
  writeFileSync(`${file}.tmp`, JSON.stringify({ id, tool: name, why }))
  renameSync(`${file}.tmp`, file)
  try {
    for (let i = 0; i < 200; i++) {
      if (existsSync(answer)) {
        if (JSON.parse(readFileSync(answer, 'utf8')).allow) return
        throw new Error(`The person chose Don't allow for ${name}, so it didn't run.`)
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('No answer.')
  } finally { rmSync(file, { force: true }); rmSync(answer, { force: true }) }
}
createInterface({ input: process.stdin }).on('line', async line => {
  const { id, method, params = {} } = JSON.parse(line)
  if (id === undefined) return
  if (method === 'initialize') return write({ id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake' }, instructions: `Fake Signal guide. chat=${process.env.IV_SIGNAL_AGENT_RUN}` } })
  if (method === 'tools/list') return write({ id, result: { tools } })
  if (method === 'tools/call') {
    try {
      if (params.name === 'signal_archive_post') await askPerson(params.name, 'This archives a post. You can restore it later.')
      return write({ id, result: { content: [{ type: 'text', text: JSON.stringify({ ran: params.name, args: params.arguments, actor: process.env.IV_SIGNAL_ACTOR }) }] } })
    } catch (error) {
      return write({ id, result: { isError: true, content: [{ type: 'text', text: error.message }] } })
    }
  }
  write({ id, error: { code: -32601, message: 'no' } })
})
