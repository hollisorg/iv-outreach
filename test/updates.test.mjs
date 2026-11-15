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
test('updates come from the public repo with no key, download by themselves and install on quit or restart', async () => {
  const f = fixture(); await f.app.check()
  assert.equal(f.u.feed.owner, 'hollisorg'); assert.equal(f.u.feed.repo, 'iv-outreach'); assert.equal(f.u.feed.private, undefined); assert.equal(f.u.feed.token, undefined)
  assert.equal(f.u.autoDownload, false); assert.equal(f.u.autoInstallOnAppQuit, true)
  assert.equal(f.u.allowDowngrade, false); assert.equal(f.u.allowPrerelease, false)
  assert.deepEqual(f.counts(), { checks: 1, downloads: 1, installs: 0 })
  assert.equal(f.app.status().phase, 'ready')
  await f.app.check(); assert.equal(f.counts().checks, 1)
  assert.throws(() => f.app.install({ busy: true }), /Wait/)
  assert.equal(f.counts().installs, 0); f.app.install(); assert.equal(f.counts().installs, 1)
})
test('with automatic updates off, a found update waits for Download', async () => {
  const f = fixture({ automatic: () => false }); await f.app.check()
  assert.equal(f.app.status().phase, 'available'); assert.equal(f.counts().downloads, 0)
  assert.throws(() => f.app.install(), /Download/)
  await f.app.download(); assert.equal(f.app.status().phase, 'ready')
})
test('a private repo falls back to the GitHub sign-in without leaking it; no sign-in is an error, and development does not check', async () => {
  const f = fixture()
  f.u.checkForUpdates = async () => { if (!f.u.feed.token) { const e = new Error('404 Not Found'); f.u.emit('error', e); throw e } f.u.emit('update-not-available') }
  await f.app.check()
  assert.equal(f.app.status().phase, 'current'); assert.equal(f.u.feed.private, true)
  assert.ok(!JSON.stringify(f.states).includes('TEST_PRIVATE_CREDENTIAL'))
  assert.ok(!f.states.some(s => s.phase === 'error'), 'the first, public try fails quietly')
  const none = fixture({ token: async () => null })
  none.u.checkForUpdates = async () => { const e = new Error('404'); none.u.emit('error', e); throw e }
  await none.app.check(); assert.equal(none.app.status().phase, 'error')
  const dev = fixture({ supported: false }); await dev.app.check(); assert.equal(dev.counts().checks, 0)
})
test('check failures redact token-bearing errors and permit retry', async () => {
  const f = fixture(); f.u.checkForUpdates = async () => { const e = new Error('Authorization: token SECRET_VALUE'); f.u.emit('error', e); throw e }
  await f.app.check(); assert.equal(f.app.status().phase, 'error'); assert.ok(!JSON.stringify(f.states).includes('SECRET_VALUE'))
  f.u.checkForUpdates = async () => f.u.emit('update-not-available')
  await f.app.check(); assert.equal(f.app.status().phase, 'current')
})
test('duplicate checks share a request; a failed download needs a fresh check', async () => {
  const f = fixture({ automatic: () => false })
  let release; f.u.checkForUpdates = () => new Promise(resolve => { release = () => { f.u.emit('update-available', { version: '0.11.0' }); resolve() } })
  const first = f.app.check(), second = f.app.check(); assert.equal(first, second)
  await new Promise(r => setTimeout(r, 0)); release(); await first
  f.u.downloadUpdate = async () => { throw new Error('failed') }
  await f.app.download(); assert.equal(f.app.status().phase, 'error'); assert.throws(() => f.app.install(), /Download/)
})
