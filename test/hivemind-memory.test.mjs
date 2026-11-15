import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { looksSecret, openMemory } from '../src/service/iv-memory.js'
import { memoryActions } from '../apps/hivemind/main/memory-tools.js'
import { gatherMaterial, importSources, parseSuggestions } from '../apps/hivemind/main/memory-import.js'

const brand = 'b0000000-0000-4000-8000-000000000001'

test('memory: add, dedupe, edit, move, forget and the prompt', () => {
  const memory = openMemory(mkdtempSync(join(tmpdir(), 'hm-mem-')))
  const first = memory.add({ scope: 'you', text: '  Prefers  no em dashes in writing. ', source: 'manual' })
  assert.equal(first.text, 'Prefers no em dashes in writing.')
  assert.equal(memory.add({ scope: 'you', text: 'prefers no em dashes in writing.' }).existed, true, 'no duplicates')
  const offer = memory.add({ scope: brand, text: 'Offers AI-assisted websites for service businesses.' })
  assert.equal(memory.list('you').length, 1)
  assert.equal(memory.list(brand).length, 1)
  memory.update(offer.id, { text: 'Offers AI-assisted websites and funnels for service businesses.' })
  memory.update(first.id, { scope: brand })
  assert.equal(memory.list('you').length, 0)
  memory.update(first.id, { scope: 'you' })
  const prompt = memory.prompt({ brandId: brand, brandName: 'Hollis' })
  assert.match(prompt, /About the person:\n- Prefers no em dashes/)
  assert.match(prompt, /About Hollis:\n- Offers AI-assisted websites and funnels/)
  assert.equal(memory.prompt({}).includes('Hollis'), false, 'no business, no business memories')
  assert.equal(memory.search('websites', ['you', brand]).length, 1)
  memory.remove(offer.id)
  assert.throws(() => memory.remove(offer.id), /no longer/)
  assert.throws(() => memory.add({ scope: 'not-a-scope', text: 'x y z' }), /who this memory/)
  memory.close()
})

test('memory never keeps secrets', () => {
  const memory = openMemory(mkdtempSync(join(tmpdir(), 'hm-mem-')))
  for (const text of ['My password: hunter22', 'api key = sk-abcdefghijklmnopqrstuvwx', 'Token ghp_abcdefghijklmnopqrstuvwxyz12', '-----BEGIN RSA PRIVATE KEY-----']) {
    assert.ok(looksSecret(text), text)
    assert.throws(() => memory.add({ scope: 'you', text }), /never keeps/)
  }
  assert.equal(looksSecret('Likes short, warm captions.'), false)
  memory.close()
})

test('remember and recall use the turn’s business', () => {
  const store = openMemory(mkdtempSync(join(tmpdir(), 'hm-mem-')))
  const tools = memoryActions({ memory: () => store })
  const turn = { brandId: brand, businessName: 'Hollis', actions: [] }
  assert.equal(tools.remember(turn, { text: 'Writes in a warm, plain voice.', about: 'business' }).status, 'saved')
  assert.equal(tools.remember(turn, { text: 'Writes in a warm, plain voice.', about: 'business' }).status, 'already-known')
  tools.remember(turn, { text: 'Lives in Ohio.', about: 'you' })
  assert.equal(store.list(brand).length, 1)
  assert.equal(turn.actions[0].type, 'remembered')
  assert.equal(turn.actions[0].item.business, 'Hollis')
  assert.throws(() => tools.remember({ brandId: '', actions: [] }, { text: 'Some fact here', about: 'business' }), /No business/)
  const other = { brandId: 'b0000000-0000-4000-8000-000000000002', businessName: 'Other', actions: [] }
  assert.equal(tools.recall(other, { query: 'warm voice' }).count, 0, 'another business can’t see Hollis memories')
  assert.equal(tools.recall(turn, { query: 'warm voice' }).count, 1)
  store.close()
})

test('import: finds the agents’ memory files and reads suggestions safely', () => {
  const home = mkdtempSync(join(tmpdir(), 'hm-home-'))
  mkdirSync(join(home, '.claude', 'projects', 'p1', 'memory'), { recursive: true })
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# Rules\nNever use em dashes.')
  writeFileSync(join(home, '.claude', 'projects', 'p1', 'memory', 'MEMORY.md'), '- [Brand](brand.md) — runs Hollis')
  mkdirSync(join(home, '.codex', 'memories_v2'), { recursive: true })
  writeFileSync(join(home, '.codex', 'AGENTS.md'), 'Be brief.')
  writeFileSync(join(home, '.codex', 'memories_v2', 'memory_summary.md'), 'The user builds IV apps.')
  const found = importSources(home, {})
  assert.equal(found.claude.count, 2)
  assert.equal(found.codex.count, 2)
  assert.match(gatherMaterial('claude', { home, env: {} }), /Never use em dashes[\s\S]*runs Hollis/)
  assert.match(gatherMaterial('codex', { home, env: {} }), /builds IV apps/)
  assert.throws(() => gatherMaterial('paste', { text: 'short' }), /Paste/)
  const brands = [{ id: brand, name: 'Hollis Organization Inc.' }]
  const parsed = parseSuggestions('Here you go:\n{"memories":[{"text":"Prefers no em dashes.","about":"you"},{"text":"Offers websites.","about":"hollis organization inc."},{"text":"password: abc123","about":"you"},{"text":"Prefers no em dashes.","about":"you"}]}', brands)
  assert.deepEqual(parsed, [{ text: 'Prefers no em dashes.', scope: 'you' }, { text: 'Offers websites.', scope: brand }])
  assert.throws(() => parseSuggestions('no json here', brands), /did not return/)
})
