import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { IVWorkspace } from '../src/service/iv-workspace.js'
import { openMemory } from '../src/service/iv-memory.js'
import { ivMemoryNote } from '../src/service/iv-memory-note.js'
import { businesses } from '../apps/hivemind/main/businesses.js'

// Throwaway app data folders with Outreach's and Signal's own business tables.
function setup() {
  const base = mkdtempSync(join(tmpdir(), 'hm-biz-'))
  const root = join(base, 'workspace')
  const outreach = join(base, 'Fitscout')
  const signal = join(base, 'IV Signal')
  for (const [dir, file, table, rows] of [
    [outreach, 'fitscout.db', 'businesses', [['legacy-business', 'Hollis Organization Inc.', { website: 'https://hollis.example', offer: 'Funnels' }], ['clean-1', 'Clean Water Co', { website: 'https://clean.example' }]]],
    [signal, 'signal.db', 'brands', [['brand-iv', 'Infinite Variance', { website: 'https://iv.example', voice: 'Bold' }]]],
  ]) {
    mkdirSync(dir, { recursive: true })
    const db = new DatabaseSync(join(dir, file))
    db.exec(`create table ${table} (id text primary key, name text not null, profile_json text not null default '{}', created_at text not null, updated_at text not null)`)
    rows.forEach(([id, name, profile], i) => db.prepare(`insert into ${table} values(?,?,?,?,?)`).run(id, name, JSON.stringify(profile), `2026-01-0${i + 1}`, '2026-01-01'))
    db.close()
  }
  process.env.FITSCOUT_DATA_DIR = outreach
  process.env.IV_SIGNAL_DATA_DIR = signal
  return { root, outreach, signal }
}

test('the active business: set once, read by everyone, only real businesses', () => {
  const { root } = setup()
  const hive = new IVWorkspace({ root, appId: 'hivemind' })
  const brand = hive.saveBrand({ name: 'Hollis' })
  assert.deepEqual(hive.active(), { brandId: '', at: null, by: null })
  const set = hive.setActive(brand.id)
  assert.equal(set.by, 'hivemind')
  assert.equal(hive.setActive(brand.id).at, set.at, 'setting the same business again changes nothing')
  assert.throws(() => hive.setActive('b0000000-0000-4000-8000-000000000009'), /not found/)
  const signal = new IVWorkspace({ root, appId: 'signal', profile: 'x' })
  assert.equal(signal.active().brandId, brand.id)
  assert.equal(signal.setActive('').brandId, '')
  hive.close(); signal.close()
  assert.throws(() => new IVWorkspace({ root, appId: 'photoshop' }), /Unknown IV app/)
})

test('Hivemind lists shared and one-app businesses, shares one with its app link, and saves edits', () => {
  const { root, signal } = setup()
  const profiles = businesses({ root })
  let list = profiles.list()
  assert.equal(list.shared.length, 0)
  assert.deepEqual(list.unshared.map(item => [item.app, item.name]), [['outreach', 'Hollis Organization Inc.'], ['outreach', 'Clean Water Co'], ['signal', 'Infinite Variance']])

  const shared = profiles.share({ app: 'signal', localId: 'brand-iv' })
  assert.equal(shared.name, 'Infinite Variance')
  assert.equal(shared.voice, 'Bold')
  assert.equal(profiles.share({ app: 'signal', localId: 'brand-iv' }).id, shared.id, 'sharing twice returns the same business')
  // The link is the one IV Signal itself reads (its profile is its data folder).
  const fromSignal = new IVWorkspace({ root, appId: 'signal', profile: signal })
  assert.equal(fromSignal.link('brand-iv').brandId, shared.id)
  fromSignal.close()
  list = profiles.list()
  assert.equal(list.shared[0].apps.signal.localId, 'brand-iv')
  assert.equal(list.unshared.length, 2)

  const edited = profiles.save({ brand: { ...shared, offer: 'AI films' }, revision: shared.revision })
  assert.equal(edited.offer, 'AI films')
  assert.equal(edited.revision, shared.revision + 1)
  assert.throws(() => profiles.save({ brand: { ...shared, offer: 'Old' }, revision: shared.revision }), /changed in another IV app/)
  const created = profiles.save({ brand: { name: 'New Bakery', website: 'bakery.example' } })
  assert.equal(created.website, 'https://bakery.example/')
  assert.throws(() => profiles.share({ app: 'studio', localId: 'x' }), /Outreach or IV Signal/)

  assert.equal(profiles.setActive(created.id).brandId, created.id)
  assert.equal(profiles.list().active.brandId, created.id)
})

test('Studio\'s chat gets the active business\'s profile and memories', () => {
  const { root } = setup()
  const profiles = businesses({ root })
  const brand = profiles.save({ brand: { name: 'New Bakery', offer: 'Sourdough', voice: 'Warm' } })
  const memory = openMemory(root)
  memory.add({ scope: 'you', text: 'Likes short captions.' })
  memory.add({ scope: brand.id, text: 'Opens at 7 every day.' })
  memory.close()
  assert.doesNotMatch(ivMemoryNote({ app: 'studio', useActive: true, root }), /Bakery/, 'nothing about a business before one is active')
  profiles.setActive(brand.id)
  const note = ivMemoryNote({ app: 'studio', useActive: true, root })
  assert.match(note, /working on the business "New Bakery"/)
  assert.match(note, /"offer":"Sourdough"/)
  assert.match(note, /Opens at 7 every day/)
  assert.match(note, /Likes short captions/)
  assert.doesNotMatch(ivMemoryNote({ app: 'studio', root }), /Opens at 7/, 'only when asked to use the active business')
})
