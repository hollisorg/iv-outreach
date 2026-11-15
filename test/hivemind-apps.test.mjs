import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { appTools } from '../apps/hivemind/main/app-tools.js'
import { openMemory } from '../src/service/iv-memory.js'
import { ivMemoryNote } from '../src/service/iv-memory-note.js'

const hollis = 'b0000000-0000-4000-8000-000000000001'
const other = 'b0000000-0000-4000-8000-000000000002'
const fake = fileURLToPath(new URL('./fixtures/fake-app-mcp.mjs', import.meta.url))

// A pretend install folder (the router checks the exe and app.asar exist) and the stand-in tool server.
function setup(answerWith = null) {
  const programs = mkdtempSync(join(tmpdir(), 'hm-programs-'))
  mkdirSync(join(programs, 'IV Signal', 'resources'), { recursive: true })
  writeFileSync(join(programs, 'IV Signal', 'IV Signal.exe'), '')
  writeFileSync(join(programs, 'IV Signal', 'resources', 'app.asar'), '')
  const seen = []
  const router = appTools({
    programs, askRoot: mkdtempSync(join(tmpdir(), 'hm-asks-')),
    links: () => ({ signal: { 'local-hollis': hollis, 'local-other': other } }),
    launch: () => ({ command: process.execPath, args: [fake] }),
    hooks: {
      ask: (turn, card) => { seen.push({ ...card }); if (card.state === 'waiting' && answerWith !== null) setTimeout(() => router.answer(turn, card.key, answerWith), 30) },
      label: (turn, text) => seen.push({ label: text }),
      using: (turn, app, info) => seen.push({ using: app, look: info.look }),
    },
  })
  return { router, seen }
}
const turn = (brandId = hollis) => ({ brandId, actions: [] })

test('lists, searches and describes an app\'s tools, without the window-only ones', async () => {
  const { router } = setup()
  try {
    const all = await router.list(turn(), { app: 'signal' })
    assert.equal(all.count, 3)
    assert.match(all.guide, /chat=chat/, 'the app\'s tools run in its chat mode')
    assert.equal(all.selectedBusinessIdHere, 'local-hollis')
    assert.deepEqual(all.tools.map(tool => [tool.name, tool.kind]), [['signal_list_brands', 'look'], ['signal_draft_post', 'change'], ['signal_archive_post', 'change']])
    assert.deepEqual((await router.list(turn(), { app: 'signal', search: 'archive' })).tools.map(tool => tool.name), ['signal_archive_post'])
    assert.deepEqual(Object.keys((await router.describe(turn(), { app: 'signal', tool: 'signal_draft_post' })).inputSchema.properties), ['brand_id', 'idea'])
    await assert.rejects(router.describe(turn(), { app: 'signal', tool: 'signal_show_in_app' }), /no tool/)
    await assert.rejects(router.list(turn(), { app: 'studio' }), /isn't installed/)
    await assert.rejects(router.list(turn(), { app: 'photoshop' }), /Choose outreach/)
  } finally { router.close() }
})

test('calls run in the app as Hivemind and stay in the selected business', async () => {
  const { router, seen } = setup()
  try {
    const current = turn()
    const ran = JSON.parse((await router.call(current, { app: 'signal', tool: 'signal_list_brands' })).result)
    assert.deepEqual(ran, { ran: 'signal_list_brands', args: {}, actor: 'hivemind' })
    assert.ok(seen.some(item => item.label === 'Signal: list brands'))
    assert.ok(seen.some(item => item.using === 'signal' && item.look === true))
    await router.call(current, { app: 'signal', tool: 'signal_draft_post', arguments: { brand_id: 'local-hollis', idea: 'Spring' } })
    assert.ok(seen.some(item => item.using === 'signal' && item.look === false))
    await assert.rejects(router.call(current, { app: 'signal', tool: 'signal_draft_post', arguments: { brand_id: 'local-other' } }), /another business/)
    await assert.rejects(router.call(current, { app: 'signal', tool: 'signal_draft_post', arguments: { brand_id: 'unlinked' } }), /another business/)
    // With no business selected, Hivemind doesn't narrow it.
    await router.call(turn(''), { app: 'signal', tool: 'signal_draft_post', arguments: { brand_id: 'local-other' } })
    assert.deepEqual(current.appWork.map(step => [step.tool, step.look]), [['signal_list_brands', true], ['signal_draft_post', false]])
  } finally { router.close() }
})

test('the app\'s own Allow rule: Don\'t allow stops it, Allow lets it run', async () => {
  const declined = setup(false)
  try {
    const current = turn()
    await assert.rejects(declined.router.call(current, { app: 'signal', tool: 'signal_archive_post', arguments: { post_id: 'p1' } }), /Don't allow/)
    assert.equal(current.asks.length, 1)
    assert.equal(current.asks[0].state, 'declined')
    assert.equal(current.asks[0].why, 'This archives a post. You can restore it later.')
    assert.throws(() => declined.router.answer(current, current.asks[0].key, true), /no longer waiting/)
  } finally { declined.router.close() }
  const allowed = setup(true)
  try {
    const current = turn()
    const result = JSON.parse((await allowed.router.call(current, { app: 'signal', tool: 'signal_archive_post', arguments: { post_id: 'p1' } })).result)
    assert.equal(result.ran, 'signal_archive_post')
    assert.equal(current.asks[0].state, 'allowed')
  } finally { allowed.router.close() }
})

test('a reply that ends answers its open cards, so nothing waits', async () => {
  const { router } = setup(null)
  try {
    const current = turn()
    const pending = router.call(current, { app: 'signal', tool: 'signal_archive_post', arguments: { post_id: 'p1' } })
    for (let i = 0; i < 100 && !current.asks?.length; i++) await new Promise(resolve => setTimeout(resolve, 50))
    router.settle(current)
    await assert.rejects(pending, /Don't allow/)
    assert.equal(current.asks[0].state, 'expired')
  } finally { router.close() }
})

test('apps\' own chats get IV memory for the person and their linked business', () => {
  const root = mkdtempSync(join(tmpdir(), 'hm-note-'))
  assert.equal(ivMemoryNote({ app: 'studio', root }), '', 'nothing before there is memory')
  const db = new DatabaseSync(join(root, 'workspace.db'))
  db.exec('create table brands(id text primary key,value text not null); create table links(key text primary key,value text not null)')
  db.prepare('insert into brands values(?,?)').run(hollis, JSON.stringify({ id: hollis, name: 'Hollis' }))
  db.prepare('insert into links values(?,?)').run('signal:abc123:brand-7', JSON.stringify({ brandId: hollis }))
  db.close()
  const memory = openMemory(root)
  memory.add({ scope: 'you', text: 'Prefers short, warm captions.' })
  memory.add({ scope: hollis, text: 'Sells AI-assisted websites.' })
  memory.add({ scope: other, text: 'Another business fact.' })
  memory.close()
  const linked = ivMemoryNote({ app: 'signal', localId: 'brand-7', root })
  assert.match(linked, /^\[IV memory:[\s\S]*About the person:\n- Prefers short, warm captions\.\nAbout Hollis:\n- Sells AI-assisted websites\./)
  assert.doesNotMatch(linked, /Another business/)
  const plain = ivMemoryNote({ app: 'studio', root })
  assert.match(plain, /Prefers short/)
  assert.doesNotMatch(plain, /Sells|Another/)
  assert.doesNotMatch(ivMemoryNote({ app: 'outreach', localId: 'brand-7', root }), /Sells/, 'links are per app')
})
