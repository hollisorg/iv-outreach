// Live smoke test of the in-app chat engine: one real turn with the person's own agent against a throwaway database,
// including an Allow card answered automatically. Usage: node scripts/chat-smoke.mjs [claude|codex|hermes] [allow|deny]
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findHarnesses } from '../src/service/harness.js'
import { findHermes } from '../src/service/hermesacp.js'
import { startChatTurn, newChat, applyChatEvent } from '../src/service/agentchat.js'
import * as fs from '../src/core/index.js'

const engine = process.argv[2] || 'claude'
const decision = (process.argv[3] || 'allow') === 'allow'
const exe = { ...findHarnesses(), hermes: findHermes() }[engine]
if (!exe) throw new Error(`${engine} not installed`)
const data = mkdtempSync(join(tmpdir(), 'fitscout-smoke-'))
process.env.FITSCOUT_DATA_DIR = data

// a fictional campaign, lead and draft to approve
const db = fs.openDb()
fs.saveSender(db, { name: 'Test Sender', company: 'Fictional Co', postal_address: '1 Test St, Nowhere ZZ 00000', reply_email: 'sender@example.test' })
const c = fs.createCampaign(db, { name: 'Smoke test (fictional)', offer: 'Fictional offer', icp: { industries: ['Plumbing'] } })
const { added: [leadId] } = fs.addLeads(db, c.id, [{ name: 'Ann Able', company: 'Able Plumbing (fictional)', email: 'ann@able.test' }])
const [draft] = fs.saveDrafts(db, [{ lead_id: leadId, channel: 'email', subject: 'Quick idea', body: 'Hi Ann, a short fictional note.' }])

const server = fileURLToPath(new URL('../src/mcp/server.js', import.meta.url))
const chat = newChat({ id: 'smoke', engine })
let turn
const t0 = Date.now()
turn = startChatTurn({
  engine,
  exe,
  dir: join(data, 'chats', 'smoke'),
  message: process.argv[4] ? `${process.argv[4]} (Campaign id: ${c.id})` : `Call fitscout_overview, then approve the one waiting draft with fitscout_approve_messages (message id ${draft.message_id}). Then tell me in one sentence what happened.`,
  context: { page: 'approve', campaignId: c.id, campaignName: c.name },
  mcp: { command: process.execPath, args: [server], env: { FITSCOUT_DATA_DIR: data } },
  onEvent: (e) => {
    applyChatEvent(chat, e)
    if (e.type === 'ask') {
      console.log(`ALLOW CARD: ${e.ask.label} :: ${e.ask.why}`)
      setTimeout(() => console.log(`answered ${decision ? 'Allow' : "Don't allow"}:`, turn.answer(e.ask.id, decision)), 500)
    }
    if (e.type === 'step') console.log(`step: ${e.label}`)
    if (e.type === 'say') console.log(`agent: ${e.text}`)
  },
})
const r = await turn.promise
const status = fs.listMessages(db, {}).find((m) => m.id === draft.message_id).status
console.log(JSON.stringify({ ok: r.ok, error: r.error, session: !!r.session, seconds: Math.round((Date.now() - t0) / 1000), message_status: status, entries: chat.entries.map((e) => e.kind + (e.answer ? `:${e.answer}` : '')) }, null, 1))
