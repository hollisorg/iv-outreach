import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chatActions, decideReopen, findHandoffs } from '../apps/hivemind/main/actions.js'
import { startBridge, callBridge } from '../apps/hivemind/main/bridge.js'

const hollis = 'b0000000-0000-4000-8000-000000000001'
const other = 'b0000000-0000-4000-8000-000000000002'
const handoff = (id, { brandId = hollis, source = 'outreach', target = 'signal', title, channel = 'LinkedIn', at, status = 'draft-ready', name = 'Hollis Organization Inc.' }) => ({
  schema: 'iv.handoff.v1', id: `a0000000-0000-4000-8000-00000000000${id}`, source, target, brandId,
  brandSnapshot: { name }, brief: { title, goal: title, channel, campaign: 'Spring', evidence: [] },
  status, createdAt: at, updatedAt: at, receipts: {},
})
const items = [
  handoff(1, { source: 'studio', target: 'signal', title: 'From first inquiry to booked appointment', at: '2026-11-13T03:12:04Z' }),
  handoff(2, { source: 'outreach', target: 'studio', title: 'From first inquiry to booked appointment', at: '2026-11-13T03:12:01Z' }),
  handoff(3, { target: 'signal', title: 'Holiday hours reminder', channel: 'Facebook', at: '2026-11-10T10:00:00Z' }),
  handoff(4, { brandId: other, target: 'signal', title: 'Holiday hours reminder', at: '2026-11-12T10:00:00Z', name: 'Other Co' }),
]

test('one clear match opens; the business comes from the turn', () => {
  assert.equal(decideReopen(items, { brandId: hollis, search: 'reopen the holiday hours draft' }).item.id, items[2].id)
  assert.equal(decideReopen(items, { brandId: other, search: 'holiday hours' }).item.id, items[3].id)
  assert.equal(decideReopen(items, { brandId: hollis, search: 'first inquiry', app: 'signal' }).item.id, items[0].id)
  assert.equal(decideReopen(items, { brandId: hollis, search: 'my booked appointment project' }).item.id, items[1].id)
})

test('several matches ask, latest picks the newest, nothing matching opens nothing', () => {
  const both = decideReopen(items, { brandId: hollis, search: 'first inquiry' })
  assert.equal(both.kind, 'choose')
  assert.deepEqual(both.items.map(item => item.id), [items[0].id, items[1].id])
  assert.equal(decideReopen(items, { brandId: hollis, search: 'my latest signal draft' }).item.id, items[0].id)
  assert.equal(decideReopen(items, { brandId: hollis, search: 'pricing webinar' }).kind, 'none')
  assert.equal(findHandoffs(items, { brandId: '', search: 'holiday hours' }).matches.length, 2)
})

function fakeActions() {
  const opened = []
  const actions = chatActions({
    programs: 'C:/Programs',
    readWorkspace: () => ({ brands: [], handoffs: items, registrations: {} }),
    appStatus: id => ({ id, name: id === 'signal' ? 'IV Signal' : 'IV Studio', installed: true, connected: true }),
    openApp: async ({ id, handoffId }) => { opened.push([id, handoffId]) },
  })
  return { actions, opened }
}
const turn = (brandId = hollis) => ({ brandId, actions: [], opened: new Set() })

test('reopen opens an existing handoff once and records the result', async () => {
  const { actions, opened } = fakeActions()
  const current = turn()
  const result = await actions.reopen(current, { search: 'holiday hours', app: 'signal' })
  assert.equal(result.status, 'opened')
  assert.equal((await actions.reopen(current, { search: 'holiday hours' })).status, 'already-opened')
  assert.deepEqual(opened, [['signal', items[2].id]])
  assert.equal(current.actions.length, 1)
})

test('ambiguous requests open nothing; only offered choices can be picked', async () => {
  const { actions, opened } = fakeActions()
  const current = turn()
  const result = await actions.reopen(current, { search: 'first inquiry' })
  assert.equal(result.status, 'needs-choice')
  assert.equal(opened.length, 0)
  const offered = current.actions[0].items.map(item => item.id)
  await assert.rejects(actions.choose(turn(), items[2].id, offered), /offered/)
  await actions.choose(turn(), items[1].id, offered)
  assert.deepEqual(opened, [['studio', items[1].id]])
})

test('another business\'s handoff cannot be opened by ID', async () => {
  const { actions, opened } = fakeActions()
  await assert.rejects(actions.reopen(turn(hollis), { handoffId: items[3].id }), /selected business/)
  assert.equal(opened.length, 0)
})

test('bridge needs the token and MCP server lists and calls the tools', async () => {
  const calls = []
  const bridge = await startBridge({ find: async args => (calls.push(args), { count: 0, handoffs: [] }), reopen: async () => ({ status: 'not-found' }) })
  try {
    const denied = await fetch(`${bridge.url}/find`, { method: 'POST', body: '{}' })
    assert.equal(denied.status, 403)
    await assert.rejects(callBridge('find', {}, {}), /inside Hivemind chat/)
    assert.deepEqual(await callBridge('find', { app: 'signal' }, { HIVEMIND_BRIDGE_URL: bridge.url, HIVEMIND_BRIDGE_TOKEN: bridge.token }), { count: 0, handoffs: [] })

    const server = spawn(process.execPath, [fileURLToPath(new URL('../apps/hivemind/mcp/server.js', import.meta.url))], {
      env: { ...process.env, HIVEMIND_BRIDGE_URL: bridge.url, HIVEMIND_BRIDGE_TOKEN: bridge.token }, stdio: ['pipe', 'pipe', 'inherit'],
    })
    const replies = []
    let buffer = ''
    server.stdout.on('data', chunk => {
      buffer += chunk
      for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) { replies.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1) }
    })
    const send = message => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    send({ method: 'notifications/initialized' })
    send({ id: 2, method: 'tools/list' })
    send({ id: 3, method: 'tools/call', params: { name: 'hivemind_find_handoffs', arguments: { search: 'holiday' } } })
    for (let wait = 0; replies.length < 3 && wait < 100; wait++) await new Promise(resolve => setTimeout(resolve, 50))
    server.kill()
    assert.equal(replies[0].result.serverInfo.name, 'hivemind')
    assert.deepEqual(replies[1].result.tools.map(tool => tool.name), ['hivemind_find_handoffs', 'hivemind_reopen', 'hivemind_remember', 'hivemind_recall', 'iv_app_tools', 'iv_app_tool', 'iv_app_call'])
    assert.deepEqual(JSON.parse(replies[2].result.content[0].text), { count: 0, handoffs: [] })
    assert.deepEqual(calls.at(-1), { search: 'holiday' })
  } finally { bridge.close() }
})
