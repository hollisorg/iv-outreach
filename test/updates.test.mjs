import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AppUpdates } from '../src/service/updates.js'

function fixture(options = {}) {
  const u = new EventEmitter(); let checks = 0, downloads = 0, installs = 0
  u.setFeedURL = value => { u.feed = value }
  u.checkForUpdates = async () => { checks++; u.emit('update-available', { version: '0.11.0' }) }
  u.downloadUpdate = async () => { downloads++; u.emit('download-progress', { percent: 40.6 }); u.emit('update-downloaded', { version: '0.11.0' }) }
  u.quitAndInstall = (silent, restart) => { assert.equal(silent, false); assert.equal(restart, true); installs++ }
  const states = []
  const app = new AppUpdates({ updater: u, supported: true, version: '0.10.0', token: async () => 'TEST_PRIVATE_CREDENTIAL', onChange: s => states.push(s), ...options })
  return { u, app, states, counts: () => ({ checks, downloads, installs }) }
}
test('private updates check only, keep credentials out of state and require explicit download/restart', async () => {
  const f = fixture(); await f.app.check()
  assert.equal(f.u.feed.owner, 'hollisorg'); assert.equal(f.u.feed.repo, 'iv-outreach'); assert.equal(f.u.feed.private, true)
  assert.equal(f.u.autoDownload, false); assert.equal(f.u.autoInstallOnAppQuit, false)
  assert.equal(f.u.allowDowngrade, false); assert.equal(f.u.allowPrerelease, false)
  assert.deepEqual(f.counts(), { checks: 1, downloads: 0, installs: 0 })
  assert.equal(f.app.status().phase, 'available')
  assert.throws(() => f.app.install(), /Download/)
  await f.app.download(); assert.equal(f.app.status().phase, 'ready')
  await f.app.check(); assert.equal(f.counts().checks, 1)
  assert.throws(() => f.app.install({ busy: true }), /Wait/)
  assert.equal(f.counts().installs, 0); f.app.install(); assert.equal(f.counts().installs, 1)
  assert.ok(!JSON.stringify(f.states).includes('TEST_PRIVATE_CREDENTIAL'))
})
test('missing auth never falls back to public feed; development does not check', async () => {
  const f = fixture({ token: async () => null }); await f.app.check()
  assert.equal(f.app.status().phase, 'auth-required'); assert.equal(f.u.feed, undefined); assert.equal(f.counts().checks, 0)
  const dev = fixture({ supported: false }); await dev.app.check(); assert.equal(dev.counts().checks, 0)
})
test('check failures redact token-bearing errors and permit retry', async () => {
  const f = fixture(); f.u.checkForUpdates = async () => { const e = new Error('Authorization: token SECRET_VALUE'); f.u.emit('error', e); throw e }
  await f.app.check(); assert.equal(f.app.status().phase, 'error'); assert.ok(!JSON.stringify(f.states).includes('SECRET_VALUE'))
  f.u.checkForUpdates = async () => f.u.emit('update-not-available')
  await f.app.check(); assert.equal(f.app.status().phase, 'current')
})
test('duplicate checks share a request; interrupted download requires fresh check', async () => {
  let resolveToken; const f = fixture({ token: () => new Promise(resolve => { resolveToken = resolve }) })
  const first = f.app.check(), second = f.app.check(); assert.equal(first, second)
  resolveToken('TEST_TOKEN'); await first; assert.equal(f.counts().checks, 1)
  f.u.downloadUpdate = async () => { throw new Error('failed') }
  await f.app.download(); assert.equal(f.app.status().phase, 'error'); assert.throws(() => f.app.install(), /Download/)
})
