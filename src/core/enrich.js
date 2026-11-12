// Website research: fetch a business's own public site (home, contact, about),
// pull published contact emails, the social profiles the business links to itself,
// and a short text summary for Claude to judge fit and personalise drafts.
//
// Deliberately NOT done: guessing personal emails, cross-site username hunting,
// or scraping logged-in platforms. We only read what the business publishes.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { now, tx, logEvent } from './db.js'
import { normEmail, normUrl, normLinkedin, clip } from './normalize.js'
import { recomputeLead } from './scoring.js'

const UA = 'FitscoutBot/0.1 (business website research; respects robots.txt)'
const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 12_000
const EXTRA_PATHS = ['/contact', '/contact-us', '/about', '/about-us']

function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

async function assertPublicHost(hostname, allowPrivate) {
  if (allowPrivate) return
  if (/^localhost$|\.local$|\.internal$/i.test(hostname)) throw new Error(`Refusing non-public host ${hostname}`)
  const addrs = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true })
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error(`Refusing non-public host ${hostname}`)
}

export async function safeFetch(url, { allowPrivate = false, accept = 'text/html' } = {}) {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current)
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are allowed')
    await assertPublicHost(u.hostname, allowPrivate)
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString()
      continue
    }
    if (!res.ok) return { url: current, status: res.status, text: '' }
    const reader = res.body?.getReader()
    const chunks = []
    let size = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_BYTES) { await reader.cancel(); break }
        chunks.push(value)
      }
    }
    return { url: current, status: res.status, text: Buffer.concat(chunks).toString('utf8') }
  }
  throw new Error('Too many redirects')
}

// Tiny robots.txt reader: honours Disallow rules for "*" and our bot name.
export function robotsAllows(robotsTxt, path) {
  if (!robotsTxt) return true
  let applies = false
  let seenAgent = false
  const rules = []
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!m) continue
    const [, key, value] = m
    if (key.toLowerCase() === 'user-agent') {
      if (seenAgent && rules.length) seenAgent = false
      if (!seenAgent) { applies = false; seenAgent = true }
      if (value === '*' || /fitscout/i.test(value)) applies = true
    } else {
      seenAgent = false
      if (applies && key.toLowerCase() === 'disallow' && value) rules.push(value)
      if (applies && key.toLowerCase() === 'allow' && value) rules.push(`!${value}`)
    }
  }
  let verdict = true
  let longest = -1
  for (const rule of rules) {
    const allow = rule.startsWith('!')
    const prefix = allow ? rule.slice(1) : rule
    if (path.startsWith(prefix.replace(/\*$/, '')) && prefix.length > longest) {
      longest = prefix.length
      verdict = allow
    }
  }
  return verdict
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#64;|&#x40;/gi, '@').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')

export function extractFromHtml(html, baseUrl) {
  const text = decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()
  const description = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1] || '',
  ).trim()

  const emails = new Set()
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const e = normEmail(decodeURIComponent(m[1]))
    if (e) emails.add(e)
  }
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const e = normEmail(m[0])
    if (e) emails.add(e)
  }
  const junk = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain|email)\.|^(noreply|no-reply|donotreply)@/i
  const cleanEmails = [...emails].filter((e) => !junk.test(e)).slice(0, 10)

  const socials = {}
  const patterns = {
    linkedin: /linkedin\.com\/(company|in)\//i,
    facebook: /facebook\.com\//i,
    instagram: /instagram\.com\//i,
    x: /(twitter|x)\.com\//i,
    youtube: /youtube\.com\//i,
    tiktok: /tiktok\.com\/@/i,
  }
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let href
    try { href = new URL(decode(m[1]), baseUrl).toString() } catch { continue }
    for (const [key, re] of Object.entries(patterns)) {
      if (!socials[key] && re.test(href) && !/sharer|share\?|intent\/|\/plugins\//i.test(href)) {
        socials[key] = key === 'linkedin' ? (normLinkedin(href) || href) : href.split('?')[0]
      }
    }
  }
  return { title, description, text, emails: cleanEmails, socials }
}

// Prefer the named contact's own address, then role addresses people actually read.
function bestEmail(emails, lead) {
  if (!emails.length) return null
  const domain = lead.domain
  const onDomain = emails.filter((e) => domain && e.endsWith(`@${domain}`))
  const pool = onDomain.length ? onDomain : emails
  const first = (lead.name || '').split(/\s+/)[0]?.toLowerCase()
  if (first) {
    const personal = pool.find((e) => e.split('@')[0].includes(first))
    if (personal) return personal
  }
  const order = ['owner', 'info', 'hello', 'contact', 'office', 'sales', 'admin']
  for (const prefix of order) {
    const hit = pool.find((e) => e.startsWith(`${prefix}@`))
    if (hit) return hit
  }
  return pool[0]
}

export async function researchSite(website, { allowPrivate = false, summaryMax = 1500 } = {}) {
  const home = normUrl(website)
  if (!home) throw new Error('No valid website')
  const origin = new URL(home).origin
  let robots = ''
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { allowPrivate, accept: 'text/plain' })
    if (r.status === 200) robots = r.text
  } catch { /* no robots.txt is fine */ }

  const pages = []
  const paths = [new URL(home).pathname || '/', ...EXTRA_PATHS]
  for (const path of paths) {
    if (pages.length >= 3) break
    if (!robotsAllows(robots, path)) continue
    try {
      const res = await safeFetch(`${origin}${path}`, { allowPrivate })
      const finalUrl = res.url.replace(/\/$/, '')
      if (pages.some((p) => p.finalUrl === finalUrl)) continue
      if (res.status === 200 && res.text) pages.push({ path, finalUrl, ...extractFromHtml(res.text, res.url) })
    } catch (err) {
      if (path === paths[0]) throw err
    }
  }
  if (!pages.length) throw new Error('Site did not return any readable pages (or robots.txt blocks it)')
  const emails = [...new Set(pages.flatMap((p) => p.emails))]
  const socials = Object.assign({}, ...pages.map((p) => p.socials).reverse())
  const main = pages[0]
  const summary = clip(pages.map((p, i) => [i ? `[${p.path}]` : '', p.title, p.description, p.text]
    .filter(Boolean).join(' | ')).join('\n'), summaryMax)
  return { emails, socials, summary, pagesRead: pages.map((p) => p.path) }
}

export async function enrichLeads(db, { campaign_id, lead_ids, limit = 10, allowPrivate = false } = {}) {
  const rows = lead_ids?.length
    ? lead_ids.map((id) => db.prepare('select * from leads where id = ?').get(id)).filter(Boolean)
    : db.prepare(`select * from leads where campaign_id = ? and enriched_at is null and website is not null
        and status != 'suppressed' order by created_at limit ?`).all(campaign_id, Math.min(limit, 25))
  const results = []
  for (const lead of rows) {
    if (!lead.website) { results.push({ lead_id: lead.id, ok: false, error: 'No website' }); continue }
    try {
      const r = await researchSite(lead.website, { allowPrivate })
      const email = lead.email || bestEmail(r.emails, lead)
      tx(db, () => {
        db.prepare(`update leads set site_summary = ?, socials_json = ?, email = ?, email_status = ?,
          linkedin_url = coalesce(linkedin_url, ?), enriched_at = ?,
          status = case when status = 'new' then 'enriched' else status end, updated_at = ? where id = ?`)
          .run(r.summary, JSON.stringify(r.socials), email,
            lead.email ? lead.email_status : (email ? 'found_on_site' : 'none'),
            r.socials.linkedin?.includes('/in/') ? r.socials.linkedin : null, now(), now(), lead.id)
        logEvent(db, 'enriched', lead.id, { pages: r.pagesRead, emails_found: r.emails.length })
        recomputeLead(db, lead.id)
      })
      results.push({ lead_id: lead.id, ok: true, email_found: Boolean(email && !lead.email), socials: Object.keys(r.socials) })
    } catch (err) {
      db.prepare(`update leads set enriched_at = ?, updated_at = ? where id = ?`).run(now(), now(), lead.id)
      logEvent(db, 'enrich_failed', lead.id, { error: String(err.message || err) })
      results.push({ lead_id: lead.id, ok: false, error: String(err.message || err) })
    }
  }
  return { processed: results.length, results }
}

export async function fetchWebsiteText(url, opts = {}) {
  const r = await researchSite(url, { ...opts, summaryMax: 8000 })
  return { summary: r.summary, socials: r.socials, public_emails: r.emails, pages_read: r.pagesRead }
}
