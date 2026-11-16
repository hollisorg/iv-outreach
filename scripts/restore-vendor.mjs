// Puts the pinned Google Maps scraper (gosom/google-maps-scraper v1.18.2, MIT) in vendor/gmaps for this platform:
//   Windows: the release's windows-amd64 exe, checked against its SHA-256 (google_maps_scraper.exe)
//   Intel Mac: the release's darwin-amd64 binary, checked against its SHA-256 (google_maps_scraper)
//   Apple Silicon Mac: the release has no arm64 binary, so it's built from the same pinned commit with Go (CGO off,
//     as the release builds are), the way the project's own macOS instructions do it (google_maps_scraper)
// Usage: node scripts/restore-vendor.mjs [--arch=arm64|x64]   (defaults to this machine's)
import { mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'

const VERSION = '1.18.2'
const COMMIT = '146aefe83844960bb534f335261a4435783a58cc' // the v1.18.2 tag
const RELEASE = `https://github.com/gosom/google-maps-scraper/releases/download/v${VERSION}`
const PINNED = {
  win32: { asset: `google_maps_scraper-${VERSION}-windows-amd64.exe`, sha256: '6609e9638ee303b6d419a329f629efcd9ed5d083f86ad6b93f92a21d59c2aca5', file: 'google_maps_scraper.exe' },
  'darwin-x64': { asset: `google_maps_scraper-${VERSION}-darwin-amd64`, sha256: 'c166042f5bd00bc8ae48b9e05ab38dc029b55b8613c4d8ad2602b2f4e6b40ff4', file: 'google_maps_scraper' },
}
const arch = process.argv.find((a) => a.startsWith('--arch='))?.slice(7) || process.arch
const key = process.platform === 'win32' ? 'win32' : `${process.platform}-${arch}`
const hash = (data) => createHash('sha256').update(data).digest('hex')

if (PINNED[key]) {
  const { asset, sha256, file: name } = PINNED[key]
  const file = resolve('vendor/gmaps', name)
  try { if (hash(await readFile(file)) === sha256) { console.log('Pinned Maps scraper already verified.'); process.exit(0) } } catch {}
  const response = await fetch(`${RELEASE}/${asset}`, { signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw new Error(`Maps scraper download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (hash(bytes) !== sha256) throw new Error('Maps scraper checksum mismatch; refusing to package it.')
  await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes)
  if (!name.endsWith('.exe')) await chmod(file, 0o755)
  console.log(`Pinned Maps scraper (${asset}) downloaded and SHA-256 verified.`)
} else if (key === 'darwin-arm64') {
  const file = resolve('vendor/gmaps/google_maps_scraper')
  const src = join(tmpdir(), `gmaps-src-${VERSION}`)
  await rm(src, { recursive: true, force: true })
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', `v${VERSION}`, 'https://github.com/gosom/google-maps-scraper.git', src], { stdio: 'inherit' })
  const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== COMMIT) throw new Error(`v${VERSION} points at ${head}, not the pinned ${COMMIT}; refusing to build it.`)
  await mkdir(dirname(file), { recursive: true })
  execFileSync('go', ['build', '-trimpath', '-o', file, '.'], { cwd: src, stdio: 'inherit', env: { ...process.env, CGO_ENABLED: '0', GOOS: 'darwin', GOARCH: 'arm64' } })
  await chmod(file, 0o755)
  await rm(src, { recursive: true, force: true })
  console.log(`Maps scraper built for Apple Silicon from pinned commit ${COMMIT.slice(0, 12)} (sha256 ${hash(await readFile(file))}).`)
} else {
  throw new Error(`No pinned Maps scraper for ${key}.`)
}
