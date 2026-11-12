// Do-not-contact list. Checked before every draft approval and every send,
// across all campaigns.
import { now, logEvent } from './db.js'
import { normEmail, emailDomain, normLinkedin, domainOf } from './normalize.js'

function normalize(kind, value) {
  if (kind === 'email') return normEmail(value)
  if (kind === 'domain') return domainOf(value) || String(value || '').trim().toLowerCase() || null
  if (kind === 'linkedin') return normLinkedin(value)
  return null
}

export function suppress(db, { kind, value, reason }) {
  const v = normalize(kind, value)
  if (!v) throw new Error(`Not a valid ${kind}: ${value}`)
  db.prepare(`insert into suppression (kind, value, reason, created_at) values (?, ?, ?, ?)
    on conflict(kind, value) do update set reason = coalesce(excluded.reason, suppression.reason)`)
    .run(kind, v, reason || null, now())
  // Mark matching leads everywhere and cancel anything not yet sent to them.
  const col = kind === 'email' ? 'email' : kind === 'linkedin' ? 'linkedin_url' : 'domain'
  const leads = kind === 'domain'
    ? db.prepare(`select id from leads where domain = ? or email like ?`).all(v, `%@${v}`)
    : db.prepare(`select id from leads where ${col} = ?`).all(v)
  for (const { id } of leads) {
    db.prepare(`update leads set status = 'suppressed', updated_at = ? where id = ?`).run(now(), id)
    db.prepare(`update messages set status = 'cancelled', updated_at = ? where lead_id = ? and status in ('draft','approved')`)
      .run(now(), id)
    logEvent(db, 'suppressed', id, { kind, reason })
  }
  return { kind, value: v, leadsAffected: leads.length }
}

export function isSuppressed(db, lead) {
  const checks = []
  const email = normEmail(lead.email)
  if (email) checks.push(['email', email], ['domain', emailDomain(email)])
  if (lead.domain) checks.push(['domain', lead.domain])
  const li = normLinkedin(lead.linkedin_url)
  if (li) checks.push(['linkedin', li])
  const stmt = db.prepare('select reason from suppression where kind = ? and value = ?')
  for (const [kind, value] of checks) {
    const hit = stmt.get(kind, value)
    if (hit) return { kind, value, reason: hit.reason }
  }
  return null
}

export function listSuppression(db) {
  return db.prepare('select kind, value, reason, created_at from suppression order by created_at desc').all()
}
