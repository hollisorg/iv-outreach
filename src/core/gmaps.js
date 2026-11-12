// Google Maps / Google Business Profile listings as a lead source, through gosom/google-maps-scraper (MIT; the Windows
// binary lives in vendor/gmaps). Fast mode: one search around a point, about 20 businesses with category, address,
// phone, website, rating and review count. Runs locally; no API key.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addLeads } from './leads.js'
import { now, tx, logEvent } from './db.js'
import { normUrl, domainOf } from './normalize.js'

const here = dirname(fileURLToPath(import.meta.url))

export function scraperPath() {
  const candidates = [
    process.env.FITSCOUT_GMAPS_EXE,
    // packaged app: resources/vendor/gmaps; dev: repo/vendor/gmaps (src/core -> repo root, or out/main -> repo root)
    process.resourcesPath && join(process.resourcesPath, 'vendor', 'gmaps', 'google_maps_scraper.exe'),
    // the MCP server runs the app's exe in Node mode, where resourcesPath may be unset: resources sits beside the exe
    join(dirname(process.execPath), 'resources', 'vendor', 'gmaps', 'google_maps_scraper.exe'),
    join(here, '..', '..', 'vendor', 'gmaps', 'google_maps_scraper.exe'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || null
}

// A place name to coordinates, via OpenStreetMap's public geocoder (only the place name is sent).
export async function geocode(place) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`
  const res = await fetch(url, { headers: { 'user-agent': 'Fitscout/0.1 (local lead research app)' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Couldn't look up "${place}" on OpenStreetMap (${res.status})`)
  const [hit] = await res.json()
  if (!hit) throw new Error(`OpenStreetMap doesn't know "${place}". Try "City, State".`)
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name }
}

function run(exe, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, windowsHide: true })
    let err = ''
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
    child.stdout.on('data', (d) => (err = (err + d).slice(-4000)))
    const timer = setTimeout(() => { child.kill(); reject(new Error('Google Maps search took too long')) }, timeoutMs)
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, log: err }) })
  })
}

// Map one scraper record to a lead. Listing data is the business's own public Google profile.
export function placeToLead(p, query) {
  const website = normUrl(p.web_site)
  // strip tracking parameters Google listings add (utm_*)
  let site = website
  if (website) {
    try {
      const u = new URL(website)
      for (const k of [...u.searchParams.keys()]) if (/^utm_|^gclid$|^fbclid$/i.test(k)) u.searchParams.delete(k)
      site = u.toString()
    } catch { /* keep as is */ }
  }
  const categories = Array.isArray(p.categories) ? p.categories : p.category ? [p.category] : []
  return {
    company: p.title,
    website: site,
    phone: p.phone || null,
    location: p.address || null,
    source: 'google_maps',
    source_url: p.data_id ? `https://www.google.com/maps/place/?q=place_id:${p.place_id || ''}&ftid=${p.data_id}` : null,
    notes: [categories.slice(0, 4).join(', '), p.review_rating ? `${p.review_rating}★ from ${p.review_count || 0} Google reviews` : null, `Found on Google Maps for "${query}"`].filter(Boolean).join(' · '),
    _maps: { category: categories[0] || null, rating: p.review_rating || null, review_count: p.review_count ?? null, address: p.address || null },
  }
}

export async function searchGoogleMaps(db, { campaign_id, query, near, lat, lng, radius_m = 10000, zoom = 14, limit = 20 }) {
  const exe = scraperPath()
  if (!exe) throw new Error('The Google Maps scraper isn\'t installed (vendor/gmaps/google_maps_scraper.exe).')
  if (!query || !String(query).trim()) throw new Error('Give a search, like "plumbers in Westerville, Ohio".')
  let point = lat != null && lng != null ? { lat: Number(lat), lng: Number(lng), label: null } : null
  if (!point) point = await geocode(near || query.replace(/^.*?\bin\b\s+/i, ''))
  const dir = mkdtempSync(join(tmpdir(), 'fitscout-gmaps-'))
  try {
    writeFileSync(join(dir, 'q.txt'), `${String(query).trim().replace(/\r?\n/g, ' ')}\n`)
    const out = join(dir, 'out.json')
    const { log } = await run(exe, [
      '-input', join(dir, 'q.txt'), '-results', out, '-json', '-fast-mode',
      '-geo', `${point.lat},${point.lng}`, '-radius', String(Math.max(1000, Math.min(50000, radius_m))),
      '-zoom', String(Math.max(10, Math.min(18, zoom))), '-c', '1', '-exit-on-inactivity', '1m',
    ], dir, 5 * 60000)
    let places = []
    try { places = JSON.parse(readFileSync(out, 'utf8') || '[]') } catch { places = [] }
    if (!places.length) {
      const why = /unexpected page type|captcha|unusual traffic/i.test(log) ? ' Google showed a check page instead of results; try again later.' : ''
      return { found: 0, added: 0, duplicates: 0, point, leads: [], note: `No listings came back.${why}` }
    }
    const mapped = places.slice(0, Math.max(1, Math.min(60, limit))).map((p) => placeToLead(p, query))
    const r = addLeads(db, campaign_id, mapped)
    // Google Business Profile details on the new leads
    tx(db, () => {
      for (const lead of mapped) {
        const domain = domainOf(lead.website)
        const row = db.prepare(`select id from leads where campaign_id = ? and company = ? and (domain is ? or domain = ?) order by created_at desc limit 1`)
          .get(campaign_id, lead.company, domain, domain)
        if (row) db.prepare('update leads set category = ?, rating = ?, review_count = ?, address = ?, updated_at = ? where id = ?')
          .run(lead._maps.category, lead._maps.rating, lead._maps.review_count, lead._maps.address, now(), row.id)
      }
    })
    logEvent(db, 'maps_search', null, { campaign_id, query, found: places.length, added: r.added.length })
    return {
      found: places.length, added: r.added.length, duplicates: r.duplicates, suppressed: r.suppressed, point,
      leads: mapped.map((l) => ({ company: l.company, website: l.website, phone: l.phone, location: l.location, rating: l._maps.rating, reviews: l._maps.review_count, category: l._maps.category })),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}
