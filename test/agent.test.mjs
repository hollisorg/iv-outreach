// The ported IV Studio agent pieces: Allow rules, stream parsing, chat folding, and the MCP server's Allow handshake.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chatAsk, parseLine, claudeArgs, codexChatArgs } from '../src/service/agentrun.js'
import { newChat, applyChatEvent, contextLine, withAttachments } from '../src/service/agentchat.js'
import * as fs from '../src/core/index.js'

test('approving, cancelling and changing the sender profile need an Allow; reading does not', () => {
  assert.match(chatAsk('fitscout_approve_messages', { message_ids: ['a', 'b'] }), /2 messages/)
  assert.ok(chatAsk('fitscout_cancel_messages', { message_ids: ['a'] }))
  assert.ok(chatAsk('fitscout_sender_profile', { daily_email_cap: 70 }))
  assert.equal(chatAsk('fitscout_sender_profile', {}), null, 'reading the profile is free')
  assert.equal(chatAsk('fitscout_research_plan', { count: 5 }), null)
  assert.equal(chatAsk('fitscout_save_research', { lead_id: 'local-research' }), null)
  for (const t of ['fitscout_overview', 'fitscout_add_leads', 'fitscout_save_drafts', 'fitscout_list_leads']) assert.equal(chatAsk(t, {}), null)
})

test('agents get Fitscout tools plus web research, nothing else', () => {
  const c = claudeArgs({ mcpConfigFile: 'm.json', promptFile: 'p.txt' })
  assert.equal(c[c.indexOf('--tools') + 1], 'WebSearch,WebFetch')
  assert.equal(c[c.indexOf('--allowedTools') + 1], 'mcp__fitscout,WebSearch,WebFetch')
  assert.ok(c.includes('--strict-mcp-config'))
  const x = codexChatArgs({ mcp: { command: 'e.exe', args: ['m.js'], env: { A: '1' } } })
  assert.ok(x.includes('sandbox_mode="read-only"'))
  assert.ok(x.includes('web_search="live"'))
})

test('parses Claude Code and Codex streams into chat events', () => {
  const claude = [
    { type: 'system', subtype: 'init', session_id: 's1' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'On it.' }, { type: 'tool_use', id: 't1', name: 'mcp__fitscout__fitscout_add_leads' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'No campaign' }] } },
    { type: 'result', subtype: 'success', result: 'Done.', usage: { input_tokens: 10, output_tokens: 5 } },
  ].flatMap((m) => parseLine('claude', JSON.stringify(m)))
  assert.deepEqual(claude.map((e) => e.type), ['session', 'say', 'step', 'stepError', 'usage', 'end'])
  assert.equal(claude[2].label, 'Added leads')
  const codex = [
    { type: 'thread.started', thread_id: 'th' },
    { type: 'item.started', item: { type: 'web_search', id: 'w' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Found 3.' } },
    { type: 'turn.completed', usage: { input_tokens: 9 } },
  ].flatMap((m) => parseLine('codex', JSON.stringify(m)))
  assert.deepEqual(codex.map((e) => e.type), ['session', 'step', 'say', 'usage', 'end'])
  assert.equal(codex[1].label, 'Searched the web')
})

test('folds events into a chat: repeated searches collapse, asks get answered', () => {
  const chat = newChat({ id: 'c', engine: 'claude' })
  for (const e of [
    { type: 'step', tool: 'WebSearch', label: 'Searched the web', id: 'a' },
    { type: 'step', tool: 'WebSearch', label: 'Searched the web', id: 'b' },
    { type: 'ask', ask: { id: 'k', tool: 'fitscout_approve_messages', label: 'Approved messages', why: 'x' } },
    { type: 'asked', id: 'k', allow: true },
    { type: 'say', text: 'Approved.' },
  ]) applyChatEvent(chat, e)
  assert.equal(chat.entries[0].count, 2)
  assert.equal(chat.entries[1].answer, 'allow')
  assert.equal(chat.entries.at(-1).text, 'Approved.')
})

test('context line and CSV attachments', () => {
  assert.equal(contextLine({ page: 'leads', campaignId: 'c1', campaignName: 'Plumbers' }), '[IV Outreach is showing Leads; campaign "Plumbers" id c1]')
  const m = withAttachments('Import these', ['C:\\x\\leads.csv', 'C:\\x\\photo.png'])
  assert.match(m, /CSV of leads: C:\\x\\leads\.csv/)
  assert.doesNotMatch(m, /photo/)
})

test('MCP server in chat mode waits for the Allow card, and Don\'t allow blocks the approval', async () => {
  const data = mkdtempSync(join(tmpdir(), 'fs-ask-'))
  const asks = join(data, 'asks')
  process.env.FITSCOUT_DATA_DIR = data
  const db = fs.openDb()
  fs.saveSender(db, { name: 'T', company: 'Fictional', postal_address: '1 Test St', reply_email: 't@example.test' })
  const c = fs.createCampaign(db, { name: 'Ask test', offer: 'x', icp: {} })
  const { added: [lead] } = fs.addLeads(db, c.id, [{ name: 'A', email: 'a@lead.test' }])
  const [d1, d2] = fs.saveDrafts(db, [
    { lead_id: lead, channel: 'email', step: 1, subject: 'Hi', body: 'One' },
    { lead_id: lead, channel: 'email', step: 2, subject: 'Re', body: 'Two' },
  ])
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/mcp/server.js', import.meta.url))],
    env: { ...process.env, FITSCOUT_DATA_DIR: data, FITSCOUT_AGENT_RUN: 'chat', FITSCOUT_AGENT_ASK: asks },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(transport)
  const answerNext = (allow) => {
    const t = setInterval(() => {
      let files = []
      try { files = readdirSync(asks).filter((n) => n.endsWith('.ask.json')) } catch {}
      if (!files.length) return
      clearInterval(t)
      const ask = JSON.parse(readFileSync(join(asks, files[0]), 'utf8'))
      const file = join(asks, `${ask.id}.answer.json`)
      writeFileSync(`${file}.tmp`, JSON.stringify({ allow }))
      renameSync(`${file}.tmp`, file)
    }, 100)
  }
  try {
    answerNext(false)
    const no = await client.callTool({ name: 'fitscout_approve_messages', arguments: { message_ids: [d1.message_id] } })
    assert.equal(no.isError, true)
    assert.match(no.content[0].text, /Don't allow/)
    answerNext(true)
    const yes = await client.callTool({ name: 'fitscout_approve_messages', arguments: { message_ids: [d2.message_id] } })
    assert.ok(!yes.isError, yes.content?.[0]?.text)
    const status = Object.fromEntries(fs.listMessages(db, {}).map((m) => [m.id, m.status]))
    assert.equal(status[d1.message_id], 'draft')
    assert.equal(status[d2.message_id], 'approved')
    // reading never asks
    const ov = await client.callTool({ name: 'fitscout_overview', arguments: {} })
    assert.ok(!ov.isError)
  } finally {
    await client.close()
  }
})
