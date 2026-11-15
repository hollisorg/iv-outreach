import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createChat } from '../apps/hivemind/main/chat.js'

const brand = 'b0000000-0000-4000-8000-000000000001'
const workspace = () => ({ brands: [{ id: brand, name: 'Hollis' }], handoffs: [] })
const make = directory => createChat({ directory, workspace, emit: () => {}, actions: {}, mcpScript: 'unused.js' })

test('earlier per-business conversations become threads', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hm-chat-'))
  writeFileSync(join(directory, 'conversations.json'), JSON.stringify({
    [`claude:${brand}`]: [{ role: 'user', text: 'Plan a spring campaign for the bakery' }, { role: 'assistant', text: 'Here is a plan.' }],
    'codex:general': [{ role: 'user', text: 'Hello' }],
    'claude:general': [],
  }))
  const chat = make(directory)
  const forBrand = chat.list(brand)
  assert.equal(forBrand.length, 1)
  assert.equal(forBrand[0].title, 'Plan a spring campaign for the bakery')
  assert.equal(forBrand[0].engine, 'claude')
  assert.equal(chat.list('').length, 1)
  assert.equal(chat.view(forBrand[0].id).messages.length, 2)
})

test('threads: create, rename, model, agent switch drops the session, delete', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hm-chat-'))
  const chat = make(directory)
  const created = chat.create({ brandId: brand, engine: 'claude', model: 'claude-sonnet-5-5' })
  const id = created.thread.id
  assert.equal(created.thread.model, 'claude-sonnet-5-5')
  assert.throws(() => chat.create({ brandId: 'not-a-business' }), /profile available/)
  assert.throws(() => chat.create({ brandId: brand, model: 'bad model; rm' }), /model/)

  // Simulate a finished turn that left a session behind.
  const saved = JSON.parse(readFileSync(join(directory, 'threads.json'), 'utf8'))
  saved.threads[id].session = 'session-123'
  saved.threads[id].messages = [{ role: 'user', text: 'hi' }]
  writeFileSync(join(directory, 'threads.json'), JSON.stringify(saved))
  const again = make(directory)
  again.update(id, { title: 'Spring campaign' })
  again.update(id, { model: 'claude-opus-5-5' })
  let stored = JSON.parse(readFileSync(join(directory, 'threads.json'), 'utf8')).threads[id]
  assert.equal(stored.title, 'Spring campaign')
  assert.equal(stored.session, 'session-123', 'changing the model keeps the session')
  again.update(id, { engine: 'codex' })
  stored = JSON.parse(readFileSync(join(directory, 'threads.json'), 'utf8')).threads[id]
  assert.equal(stored.engine, 'codex')
  assert.equal(stored.session, null, 'a new agent starts a fresh session')
  assert.equal(stored.messages.length, 1, 'the chat so far is kept')
  again.remove(id)
  assert.equal(again.list(brand).length, 0)
})
