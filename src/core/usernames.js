// Username lookup across public sites, using the WhatsMyName dataset (CC BY-SA 4.0, (C) Micah Hoffman,
// github.com/WebBreacher/WhatsMyName; the same data Blackbird uses). For a lead's business handle, checks which
// public profile pages exist and returns their links.
//
// Scope: business-relevant categories only (no NSFW, dating, political, health or gaming sites), one lead at a time,
// started by the person. Results are public profile URLs; nothing else is collected.
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { now, logEvent } from './db.js'
import { domainOf } from './normalize.js'

const here = dirname(fileURLToPath(import.meta.url))
export const CATEGORIES = new Set(['social', 'business', 'video', 'images', 'blog', 'music', 'art', 'shopping', 'tech', 'coding', 'finance', 'misc'])
// a WhatsMyName site name to the platform it is ("YouTube User2" -> youtube; "Instagram (Imginn)" is a mirror, not a profile)
function channelOf(siteName) {
  const n = String(siteName).toLowerCase()
  if (/\(|archive|mirror/.test(n)) return null
  for (const [prefix, ch] of [['facebook', 'facebook'], ['instagram', 'instagram'], ['tiktok', 'tiktok'], ['youtube', 'youtube'], ['linkedin', 'linkedin'], ['pinterest', 'pinterest'], ['threads', 'threads'], ['twitter', 'x']]) {
    if (n.startsWith(prefix)) return ch
  }
  return n === 'x' ? 'x' : null
}

let cache = null
export function loadSites(file) {
  if (cache && !file) return cache
  const candidates = [
    file,
    process.env.FITSCOUT_WMN_DATA,
    process.resourcesPath && join(process.resourcesPath, 'vendor', 'wmn', 'wmn-data.json'),
    join(dirname(process.execPath), 'resources', 'vendor', 'wmn', 'wmn-data.json'),
    join(here, '..', '..', 'vendor', 'wmn', 'wmn-data.json'),
  ].filter(Boolean)
  const path = candidates.find((p) => existsSync(p))
  if (!path) throw new Error('The WhatsMyName data isn\'t installed (vendor/wmn/wmn-data.json).')
  const data = JSON.parse(readFileSync(path, 'utf8'))
  // sites checked through an API call (post_body) have no profile page to show, so they're left out
  const sites = (data.sites || []).filter((s) => CATEGORIES.has(s.cat) && s.uri_check && s.e_string != null && s.e_code != null && !s.post_body)
  if (!file) cache = sites
  return sites
}

// Handles worth trying for a lead: the ones on its own socials (confirmed: the business links them from its own
// site), then its domain's name (unconfirmed). Returns [{ handle, confirmed }].
export function candidateHandles(lead) {
  return candidates(lead)
}
function candidates(lead) {
  const out = []
  const seen = new Set()
  const push = (handle, confirmed) => {
    const h = handle.toLowerCase()
    if (seen.has(h)) return
    seen.add(h)
    out.push({ handle: h, confirmed })
  }
  const socials = lead.socials || (() => { try { return JSON.parse(lead.socials_json || '{}') } catch { return {} } })()
  for (const key of ['instagram', 'facebook', 'x', 'tiktok', 'youtube']) {
    const url = socials[key]
    if (!url) continue
    try {
      const seg = new URL(url).pathname.split('/').filter(Boolean)[0]
      const handle = seg?.replace(/^@/, '')
      if (handle && /^[a-z0-9._-]{3,40}$/i.test(handle) && !['pages', 'profile.php', 'channel', 'c', 'user'].includes(handle)) push(handle, true)
    } catch { /* skip */ }
  }
  const domain = lead.domain || domainOf(lead.website)
  if (domain) push(domain.split('.')[0], false)
  return out.slice(0, 3)
}

async function checkSite(site, account, timeoutMs) {
  const url = site.uri_check.replace('{account}', encodeURIComponent(account))
  const init = { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Fitscout/0.1', ...(site.headers || {}) } }
  if (site.post_body) {
    init.method = 'POST'
    init.body = site.post_body.replace('{account}', account)
  }
  const res = await fetch(url, init)
  const body = res.status === 200 || res.status === site.e_code ? await res.text() : ''
  const found = res.status === site.e_code && body.includes(site.e_string)
  return found ? { site: site.name, category: site.cat, url: (site.uri_pretty || site.uri_check).replace('{account}', account) } : null
}

export async function lookupUsername(account, { sites = loadSites(), concurrency = 16, timeoutMs = 8000 } = {}) {
  if (!/^[a-z0-9._-]{2,40}$/i.test(account || '')) throw new Error(`"${account}" isn't a username that can be looked up`)
  const found = []
  let i = 0
  let checked = 0
  let failed = 0
  const worker = async () => {
    while (i < sites.length) {
      const site = sites[i++]
      try {
        const hit = await checkSite(site, account, timeoutMs)
        checked++
        if (hit) found.push(hit)
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { account, sites_checked: checked, sites_unreachable: failed, found: found.sort((a, b) => a.site.localeCompare(b.site)) }
}

// Find a lead's public profiles and merge them into its socials. handles: optional usernames to try.
export async function findSocials(db, leadId, { handles, ...opts } = {}) {
  const lead = db.prepare('select * from leads where id = ?').get(leadId)
  if (!lead) throw new Error(`No lead ${leadId}`)
  if (lead.status === 'suppressed') throw new Error('This lead is on the do-not-contact list.')
  // A handle given by the person counts as confirmed; one guessed from the domain doesn't.
  const tries = (handles?.length ? handles.map((h) => ({ handle: String(h).replace(/^@/, '').toLowerCase(), confirmed: true })) : candidateHandles(lead)).slice(0, 3)
  if (!tries.length) throw new Error('No handle to look up yet: research the lead\'s website first, or give a username.')
  const socials = JSON.parse(lead.socials_json || '{}')
  const results = []
  for (const { handle, confirmed } of tries) {
    const r = await lookupUsername(handle, opts)
    results.push({ ...r, confirmed })
    for (const hit of r.found) {
      const ch = channelOf(hit.site)
      // Only a confirmed handle fills in the lead's profiles. A same-name account on another site is often a
      // different person, so it's listed for the person to check, never messaged on a guess.
      if (confirmed && ch && !socials[ch]) socials[ch] = hit.url
      socials.found = [...(socials.found || []).filter((f) => f.url !== hit.url), { ...hit, handle, confirmed, channel: ch || null }].slice(0, 80)
    }
  }
  db.prepare('update leads set socials_json = ?, socials_scanned_at = ?, updated_at = ? where id = ?')
    .run(JSON.stringify(socials), now(), now(), leadId)
  logEvent(db, 'socials_lookup', leadId, { handles: tries.map((t) => t.handle), found: results.reduce((n, r) => n + r.found.length, 0) })
  return { lead_id: leadId, handles: tries, results, socials }
}

// The person confirms a found profile belongs to this business: it becomes the lead's profile for that platform.
export function useSocial(db, leadId, { channel, url }) {
  const lead = db.prepare('select socials_json, linkedin_url from leads where id = ?').get(leadId)
  if (!lead) throw new Error(`No lead ${leadId}`)
  const allowed = ['facebook', 'instagram', 'x', 'tiktok', 'youtube', 'linkedin', 'pinterest', 'threads']
  if (!allowed.includes(channel)) throw new Error(`Unknown platform ${channel}`)
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error('Profile links must be https')
  const socials = JSON.parse(lead.socials_json || '{}')
  socials[channel] = url
  for (const f of socials.found || []) if (f.url === url) f.confirmed = true
  db.prepare('update leads set socials_json = ?, updated_at = ? where id = ?').run(JSON.stringify(socials), now(), leadId)
  if (channel === 'linkedin' && !lead.linkedin_url && /\/in\//.test(url)) db.prepare('update leads set linkedin_url = ? where id = ?').run(url, leadId)
  return socials
}
