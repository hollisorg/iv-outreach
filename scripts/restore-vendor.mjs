import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'

const url = 'https://github.com/gosom/google-maps-scraper/releases/download/v1.18.2/google_maps_scraper-1.18.2-windows-amd64.exe'
const expected = '6609e9638ee303b6d419a329f629efcd9ed5d083f86ad6b93f92a21d59c2aca5'
const file = resolve('vendor/gmaps/google_maps_scraper.exe')
const hash = data => createHash('sha256').update(data).digest('hex')
try { if (hash(await readFile(file)) === expected) { console.log('Pinned Maps scraper already verified.'); process.exit(0) } } catch {}
const response = await fetch(url, { signal: AbortSignal.timeout(180000) })
if (!response.ok) throw new Error(`Maps scraper download failed: HTTP ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
if (hash(bytes) !== expected) throw new Error('Maps scraper checksum mismatch; refusing to package it.')
await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes)
console.log('Pinned Maps scraper downloaded and SHA-256 verified.')
