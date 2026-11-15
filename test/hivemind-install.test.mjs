import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CATALOG, installApp, installInfo, latestRelease, parseFeed } from '../apps/hivemind/main/install.js'

const installer = Buffer.from('MZ fake installer bytes '.repeat(4000))
const sha = data => createHash('sha512').update(data).digest('base64')
const feed = (file = 'IV-Chat-Setup.exe', digest = sha(installer), size = installer.length) =>
  `version: 0.1.7\nfiles:\n  - url: ${file}\n    sha512: ${digest}\n    size: ${size}\npath: ${file}\nsha512: ${digest}\nreleaseDate: '2026-10-30T16:19:22.711Z'\n`

async function stand(body, latest) {
  const server = createServer((req, res) => {
    if (req.url.endsWith('/latest.yml')) return res.end(latest)
    if (req.url.endsWith('/IV-Chat-Setup.exe')) return res.end(body)
    res.writeHead(404); res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/`
  const fetchImpl = (url, options) => fetch(url.replace(CATALOG.chat.feed, base), options)
  return { server, fetchImpl }
}

test('reads the feed and refuses odd file names or checksums', () => {
  assert.deepEqual(parseFeed(feed()), { version: '0.1.7', file: 'IV-Chat-Setup.exe', sha512: sha(installer), size: installer.length })
  assert.throws(() => parseFeed(feed('../evil.exe')), /unexpected file/)
  assert.throws(() => parseFeed(feed('IV Chat Setup.exe')), /unexpected file|expected shape/)
  assert.throws(() => parseFeed(feed('IV-Chat-Setup.exe', 'nope')), /checksum/)
  assert.throws(() => parseFeed('hello'), /expected shape/)
})

test('only apps with a public feed are installable', () => {
  assert.equal(installInfo('studio').installable, true)
  assert.equal(installInfo('signal').installable, true)
  assert.equal(installInfo('chat').installable, true)
  assert.equal(installInfo('downloader').installable, true)
  assert.equal(installInfo('keys').installable, false)
  for (const id of ['voice', 'outreach']) assert.equal(installInfo(id).installable, false)
  assert.match(installInfo('outreach').note, /private test/)
})

test('a checked download installs; a tampered or oversized one never runs', async () => {
  const runs = []
  const run = async file => { runs.push(file); return 0 }
  const tempDir = mkdtempSync(join(tmpdir(), 'hm-install-'))
  const steps = []

  let stood = await stand(installer, feed())
  try {
    assert.deepEqual(await latestRelease('chat', stood.fetchImpl), { version: '0.1.7', size: installer.length })
    const result = await installApp({ id: 'chat', name: 'IV Chat', programs: tempDir, tempDir, fetchImpl: stood.fetchImpl, run, progress: s => steps.push(s.stage) })
    assert.deepEqual(result, { version: '0.1.7', verified: true, installed: true })
    assert.equal(runs.length, 1)
    assert.ok(steps.includes('Downloading') && steps.includes('Checking the download') && steps.includes('Installing IV Chat'))
    assert.equal(existsSync(runs[0]), false, 'the installer file is removed afterwards')
    const dry = await installApp({ id: 'chat', name: 'IV Chat', programs: tempDir, tempDir, fetchImpl: stood.fetchImpl, run, dryRun: true })
    assert.equal(dry.installed, false)
    assert.equal(runs.length, 1, 'test mode never runs the installer')
  } finally { stood.server.close() }

  const tampered = Buffer.from(installer); tampered[10] ^= 1
  stood = await stand(tampered, feed())
  try {
    await assert.rejects(installApp({ id: 'chat', name: 'IV Chat', programs: tempDir, tempDir, fetchImpl: stood.fetchImpl, run }), /didn’t match its published checksum/)
  } finally { stood.server.close() }

  stood = await stand(Buffer.concat([installer, installer]), feed())
  try {
    await assert.rejects(installApp({ id: 'chat', name: 'IV Chat', programs: tempDir, tempDir, fetchImpl: stood.fetchImpl, run }), /larger than the release/)
  } finally { stood.server.close() }
  assert.equal(runs.length, 1, 'nothing ran after a failed check')
  assert.equal(existsSync(join(tempDir, 'IV-Chat-Setup.exe')), false)

  await assert.rejects(installApp({ id: 'outreach', name: 'IV Outreach', programs: tempDir, tempDir, run }), /private test/)
})

test('the menu offers IV Downloader in place of IV Keys', async () => {
  const { TOOLS } = await import('../apps/hivemind/main/workspace.js')
  assert.deepEqual(TOOLS, { chat: 'IV Chat', voice: 'IV Voice', downloader: 'IV Downloader' })
  assert.equal(CATALOG.downloader.feed, 'https://github.com/hollisorg/iv-downloader/releases/latest/download/')
  assert.equal(CATALOG.keys, undefined)
  // IV Downloader's latest.yml shape (0.2.2) reads like the other apps' feeds.
  const real = `version: 0.2.2
files:
  - url: IV-Downloader-Setup.exe
    sha512: ${'x'.repeat(86)}==
    size: 211579007
path: IV-Downloader-Setup.exe
`
  assert.deepEqual(parseFeed(real), { version: '0.2.2', file: 'IV-Downloader-Setup.exe', sha512: `${'x'.repeat(86)}==`, size: 211579007 })
  const menu = await import('node:fs').then(fs => fs.readFileSync(new URL('../apps/hivemind/renderer/main.jsx', import.meta.url), 'utf8'))
  assert.match(menu, /menuOrder = \['chat', 'outreach', 'studio', 'signal', 'voice', 'downloader'\]/)
  assert.doesNotMatch(menu, /keysIcon|IV Keys/)
})
