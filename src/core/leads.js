// Leads: add (with dedupe), list, read, fit scoring, CSV import/export.
import { readFileSync } from 'node:fs'
import { now, newId, tx, logEvent } from './db.js'
import { normEmail, normUrl, domainOf, normLinkedin, clip } from './normalize.js'
import { isSuppressed } from './suppression.js'
import { parseCsv, toCsv } from './csv.js'
import { recomputeLead } from './scoring.js'

const SOURCES = new Set(['manual', 'claude_research', 'csv', 'google_maps', 'website', 'referral'])

// Common export headers (Sales Navigator, Apollo, Google Maps scrapers, hand-made sheets).
const CSV_ALIASES = {
  name: ['name', 'full name', 'full_name', 'contact name', 'contact'],
  first: ['first name', 'first_name', 'firstname'],
  last: ['last name', 'last_name', 'lastname'],
  title: ['title', 'job title', 'position', 'role'],
  company: ['company', 'company name', 'organization', 'business', 'business name', 'account name'],
  website: ['website', 'company website', 'url', 'web', 'domain'],
  email: ['email', 'email address', 'work email', 'e-mail', 'emails'],
  linkedin_url: ['linkedin', 'linkedin url', 'person linkedin url', 'linkedin profile', 'profile url'],
  phone: ['phone', 'phone number', 'mobile', 'work phone'],
  location: ['location', 'city', 'address', 'complete_address', 'region'],
  notes: ['notes', 'note', 'description', 'category'],
}

function pick(row, key) {
  for (const alias of CSV_ALIASES[key]) if (row[alias]) return row[alias]
  return null
}

function cleanLead(input) {
  const email = normEmail(input.email)
  const website = normUrl(input.website)
  return {
    name: clip(input.name?.trim() || null, 200),
    title: clip(input.title?.trim() || null, 200),
    company: clip(input.company?.trim() || null, 200),
    website,
    domain: domainOf(website) || null,
    email,
    email_status: email ? (input.email_status === 'found_on_site' ? 'found_on_site' : 'provided') : 'none',
    linkedin_url: normLinkedin(input.linkedin_url),
    phone: clip(input.phone?.trim() || null, 60),
    location: clip(input.location?.trim() || null, 200),
    source: SOURCES.has(input.source) ? input.source : 'manual',
    source_url: normUrl(input.source_url),
    notes: clip(input.notes?.trim() || null, 2000),
  }
}

function findDuplicate(db, campaignId, lead) {
  if (lead.email) {
    const hit = db.prepare('select id from leads where campaign_id = ? and email = ?').get(campaignId, lead.email)
    if (hit) return hit.id
  }
  if (lead.linkedin_url) {
    const hit = db.prepare('select id from leads where campaign_id = ? and linkedin_url = ?').get(campaignId, lead.linkedin_url)
    if (hit) return hit.id
  }
  // Same business with no person attached: one lead per domain, or per name + phone when there's no website.
  if (lead.domain && !lead.name && !lead.email && !lead.linkedin_url) {
    const hit = db.prepare(`select id from leads where campaign_id = ? and domain = ? and name is null`).get(campaignId, lead.domain)
    if (hit) return hit.id
  }
  if (!lead.domain && lead.company && lead.phone && !lead.name) {
    const hit = db.prepare(`select id from leads where campaign_id = ? and company = ? and phone = ?`).get(campaignId, lead.company, lead.phone)
    if (hit) return hit.id
  }
  return null
}

export function addLeads(db, campaignId, inputs) {
  if (!db.prepare('select 1 from campaigns where id = ?').get(campaignId)) throw new Error(`No campaign ${campaignId}`)
  const result = { added: [], duplicates: 0, suppressed: 0, invalid: 0 }
  tx(db, () => {
    for (const input of inputs) {
      const lead = cleanLead(input)
      if (!lead.name && !lead.company && !lead.email && !lead.linkedin_url && !lead.website) {
        result.invalid++
        continue
      }
      if (findDuplicate(db, campaignId, lead)) { result.duplicates++; continue }
      const id = newId()
      const t = now()
      const blocked = isSuppressed(db, lead)
      db.prepare(`insert into leads (id, campaign_id, name, title, company, website, domain, email, email_status,
        linkedin_url, phone, location, source, source_url, notes, status, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, campaignId, lead.name, lead.title, lead.company, lead.website, lead.domain, lead.email,
          lead.email_status, lead.linkedin_url, lead.phone, lead.location, lead.source, lead.source_url,
          lead.notes, blocked ? 'suppressed' : 'new', t, t)
      if (blocked) result.suppressed++
      result.added.push(id)
    }
  })
  return result
}

export function importCsv(db, campaignId, path) {
  const rows = parseCsv(readFileSync(path, 'utf8'))
  const inputs = rows.map((row) => {
    const first = pick(row, 'first')
    const last = pick(row, 'last')
    return {
      name: pick(row, 'name') || [first, last].filter(Boolean).join(' ') || null,
      title: pick(row, 'title'),
      company: pick(row, 'company'),
      website: pick(row, 'website'),
      email: (pick(row, 'email') || '').split(/[;,\s]+/)[0],
      linkedin_url: pick(row, 'linkedin_url'),
      phone: pick(row, 'phone'),
      location: pick(row, 'location'),
      notes: pick(row, 'notes'),
      source: 'csv',
    }
  })
  return { rows: rows.length, ...addLeads(db, campaignId, inputs) }
}

function hydrate(row) {
  if (!row) return null
  const { socials_json, ...rest } = row
  return { ...rest, socials: JSON.parse(socials_json || '{}') }
}

export function getLead(db, id) {
  const lead = hydrate(db.prepare('select * from leads where id = ?').get(id))
  if (!lead) return null
  lead.messages = db.prepare('select id, channel, step, subject, body, status, sent_at, error from messages where lead_id = ? order by created_at').all(id)
  lead.replies = db.prepare('select id, channel, received_at, text, sentiment, intent from replies where lead_id = ? order by received_at').all(id)
  return lead
}

const SORTS = {
  rank: 'rank_score desc, fit_score desc nulls last, created_at',
  fit: 'fit_score desc nulls last, created_at',
  newest: 'created_at desc',
  replied: 'first_reply_at desc nulls last',
}

export function listLeads(db, { campaign_id, status, min_fit, needs, sort = 'rank', limit = 50, offset = 0 } = {}) {
  const where = []
  const args = []
  if (campaign_id) { where.push('campaign_id = ?'); args.push(campaign_id) }
  if (status) { where.push('status = ?'); args.push(status) }
  if (min_fit != null) { where.push('fit_score >= ?'); args.push(min_fit) }
  if (needs === 'enrichment') where.push("enriched_at is null and website is not null and status != 'suppressed'")
  if (needs === 'fit_score') where.push("fit_score is null and status != 'suppressed'")
  if (needs === 'draft') where.push(`status in ('new','enriched') and not exists (select 1 from messages m where m.lead_id = leads.id and m.status != 'cancelled')`)
  const sql = `select * from leads ${where.length ? `where ${where.join(' and ')}` : ''}
    order by ${SORTS[sort] || SORTS.rank} limit ? offset ?`
  return db.prepare(sql).all(...args, Math.min(Number(limit) || 50, 500), Number(offset) || 0).map(hydrate)
}

export function setFitScores(db, scores) {
  let updated = 0
  tx(db, () => {
    for (const { lead_id, fit_score, reason } of scores) {
      const score = Math.max(0, Math.min(100, Math.round(Number(fit_score))))
      if (!Number.isFinite(score)) continue
      const r = db.prepare('update leads set fit_score = ?, fit_reason = ?, updated_at = ? where id = ?')
        .run(score, clip(reason || null, 500), now(), lead_id)
      if (r.changes) { updated++; recomputeLead(db, lead_id) }
    }
  })
  return { updated }
}

export function updateLead(db, id, patch) {
  const allowed = ['name', 'title', 'company', 'email', 'linkedin_url', 'phone', 'location', 'notes', 'status']
  const current = db.prepare('select * from leads where id = ?').get(id)
  if (!current) throw new Error(`No lead ${id}`)
  const next = { ...current }
  for (const key of allowed) if (patch[key] !== undefined) next[key] = patch[key]
  if (patch.email !== undefined) {
    next.email = normEmail(patch.email)
    next.email_status = next.email ? 'provided' : 'none'
  }
  if (patch.linkedin_url !== undefined) next.linkedin_url = normLinkedin(patch.linkedin_url)
  db.prepare(`update leads set name = ?, title = ?, company = ?, email = ?, email_status = ?, linkedin_url = ?,
    phone = ?, location = ?, notes = ?, status = ?, updated_at = ? where id = ?`)
    .run(next.name, next.title, next.company, next.email, next.email_status, next.linkedin_url,
      next.phone, next.location, next.notes, next.status, now(), id)
  logEvent(db, 'lead_updated', id, { fields: Object.keys(patch) })
  return getLead(db, id)
}

export function exportCsv(db, campaignId) {
  const rows = db.prepare('select * from leads where campaign_id = ? order by rank_score desc').all(campaignId)
  return toCsv(rows, ['name', 'title', 'company', 'website', 'email', 'email_status', 'linkedin_url', 'phone',
    'location', 'status', 'fit_score', 'fit_reason', 'engagement_score', 'rank_score', 'last_contacted_at',
    'first_reply_at', 'source', 'source_url'])
}
