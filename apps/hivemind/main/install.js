// Installing a missing IV app from IV Hivemind's menu. Only apps with a public release feed can be installed:
// Hivemind reads the feed's latest.yml, downloads the installer it names from the same release over HTTPS, checks its
// size and SHA-512 against the feed, then runs it per-user and silently. Nothing is run unless the check passes.
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export const CATALOG = {
  studio: { feed: 'https://github.com/hollisorg/iv-studio/releases/latest/download/', page: 'https://github.com/hollisorg/iv-studio/releases/latest' },
  signal: { feed: 'https://github.com/hollisorg/iv-signal-releases/releases/latest/download/', page: 'https://github.com/hollisorg/iv-signal-releases/releases/latest' },
  chat: { feed: 'https://github.com/hollisorg/iv-chat/releases/latest/download/', page: 'https://github.com/hollisorg/iv-chat/releases/latest' },
  voice: { feed: 'https://github.com/hollisorg/iv-voice/releases/latest/download/', page: 'https://github.com/hollisorg/iv-voice/releases/latest' },
  downloader: { feed: 'https://github.com/hollisorg/iv-downloader/releases/latest/download/', page: 'https://github.com/hollisorg/iv-downloader/releases/latest' },
  outreach: { feed: 'https://github.com/hollisorg/iv-outreach/releases/latest/download/', page: 'https://github.com/hollisorg/iv-outreach/releases/latest' },
}

// The small part of electron-builder's latest.yml Hivemind needs: the installer file, its size and SHA-512.
export function parseFeed(text) {
  const version = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1]
  const entry = /^files:\s*\n\s+-\s+url:\s*(\S+)\s*\n\s+sha512:\s*(\S+)\s*\n\s+size:\s*(\d+)/m.exec(text)
  if (!version || !entry) throw new Error('The release feed is not in the expected shape.')
  const [, file, sha512, size] = entry
  if (!/^[A-Za-z0-9._-]+\.exe$/.test(file)) throw new Error('The release feed names an unexpected file.')
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error('The release feed has no usable checksum.')
  return { version, file, sha512, size: Number(size) }
}

export function installInfo(id) {
  const entry = CATALOG[id]
  if (!entry) return { installable: false, note: 'This app has no download.' }
  return { installable: Boolean(entry.feed), page: entry.page || null, note: entry.note || '' }
}

// The version and download size the install prompt shows.
export async function latestRelease(id, fetchImpl = fetch) {
  const entry = CATALOG[id]
  if (!entry?.feed) return null
  const response = await fetchImpl(`${entry.feed}latest.yml`, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Couldn’t reach the download (${response.status}).`)
  const { version, size } = parseFeed(await response.text())
  return { version, size }
}

// Fetches the feed, downloads and checks the installer, then runs it. progress({ stage, percent }) reports as it goes.
export async function installApp({ id, name, programs, tempDir, progress = () => {}, dryRun = false, fetchImpl = fetch, run = runInstaller }) {
  const entry = CATALOG[id]
  if (!entry?.feed) throw new Error(entry?.note || `${name} can’t be installed from here.`)
  progress({ stage: 'Checking the latest version', percent: 0 })
  const feedResponse = await fetchImpl(`${entry.feed}latest.yml`, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
  if (!feedResponse.ok) throw new Error(`Couldn’t reach the ${name} download (${feedResponse.status}).`)
  const release = parseFeed(await feedResponse.text())

  mkdirSync(tempDir, { recursive: true })
  const target = join(tempDir, release.file)
  rmSync(target, { force: true })
  const response = await fetchImpl(`${entry.feed}${release.file}`, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60 * 1000) })
  if (!response.ok || !response.body) throw new Error(`The ${name} download failed (${response.status}).`)
  const hash = createHash('sha512')
  const out = createWriteStream(target)
  let received = 0
  let lastPercent = -1
  try {
    for await (const chunk of response.body) {
      hash.update(chunk)
      received += chunk.length
      if (received > release.size) throw new Error('The download is larger than the release says.')
      if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve))
      const percent = Math.floor(received / release.size * 100)
      if (percent !== lastPercent) { lastPercent = percent; progress({ stage: 'Downloading', percent, received, size: release.size }) }
    }
  } catch (error) {
    out.destroy()
    rmSync(target, { force: true })
    throw error
  }
  await new Promise((resolve, reject) => out.end(error => error ? reject(error) : resolve()))
  progress({ stage: 'Checking the download', percent: 100 })
  if (statSync(target).size !== release.size || hash.digest('base64') !== release.sha512) {
    rmSync(target, { force: true })
    throw new Error(`The ${name} download didn’t match its published checksum, so it wasn’t installed.`)
  }
  if (dryRun) return { version: release.version, file: target, verified: true, installed: false }

  progress({ stage: `Installing ${name}`, percent: 100 })
  const code = await run(target, programs, name)
  rmSync(target, { force: true })
  if (code !== 0) throw new Error(`The ${name} installer stopped (code ${code}).`)
  return { version: release.version, verified: true, installed: true }
}

// Silent, per-user install into the standard folder the menu looks in.
function runInstaller(file, programs, name) {
  return new Promise((resolve, reject) => {
    // NSIS reads /D= only as the last argument and unquoted, so the arguments go through as written. The installer is
    // started by its bare file name (no spaces, checked in parseFeed) from its own folder, so nothing needs quoting.
    const child = spawn(basename(file), ['/S', '/currentuser', `/D=${join(programs, name)}`], { cwd: dirname(file), windowsHide: true, stdio: 'ignore', windowsVerbatimArguments: true })
    child.once('error', () => reject(new Error(`Couldn’t start the ${name} installer.`)))
    child.once('exit', code => resolve(code ?? 1))
  })
}
