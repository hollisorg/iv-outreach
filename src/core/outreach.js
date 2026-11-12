// Outreach: drafts -> compliance check -> human approval -> send (email by the app,
// LinkedIn by the person) -> replies -> ranking.
//
// Ground rules baked in here:
//  * Nothing is sent without an approval.
//  * Email goes from the user's own mailbox with their real name, company and postal
//    address, plus a one-reply opt-out (CAN-SPAM).
//  * LinkedIn is assisted, not automated: Fitscout drafts the note and opens the
//    profile; the person sends it themselves. LinkedIn's terms forbid automated messaging.
//  * Suppressed people are never contacted, from any campaign.
import { now, newId, tx, logEvent, getSetting, setSetting } from './db.js'
import { isSuppressed, suppress } from './suppression.js'
import { recomputeLead, STATUS_FROM_INTENT } from './scoring.js'
import { clip, firstName } from './normalize.js'

export const DEFAULT_SENDER = {
  name: '',
  title: '',
  company: '',
  postal_address: '',
  reply_email: '',
  signature: '',
  daily_email_cap: 30,
  daily_linkedin_cap: 20,
  followup_days: 3,
  recontact_days: 90,
}

export function getSender(db) {
  return { ...DEFAULT_SENDER, ...(getSetting(db, 'sender', {}) || {}) }
}

export function saveSender(db, patch) {
  const next = { ...getSender(db) }
  for (const key of Object.keys(DEFAULT_SENDER)) {
    if (patch[key] === undefined) continue
    next[key] = typeof DEFAULT_SENDER[key] === 'number'
      ? Math.max(0, Math.round(Number(patch[key]) || 0))
      : String(patch[key]).trim()
  }
  // Hard ceilings: past these, a single mailbox or account starts to look like a spam source.
  next.daily_email_cap = Math.min(next.daily_email_cap, 75)
  next.daily_linkedin_cap = Math.min(next.daily_linkedin_cap, 25)
  next.followup_days = Math.max(next.followup_days, 2)
  setSetting(db, 'sender', next)
  return next
}

export function senderGaps(sender) {
  const gaps = []
  if (!sender.name) gaps.push('your name')
  if (!sender.company) gaps.push('company name')
  if (!sender.postal_address) gaps.push('postal address (required by CAN-SPAM)')
  if (!sender.reply_email) gaps.push('reply-to email')
  return gaps
}

const RISKY = [
  [/\bguarantee[ds]?\b/i, 'Promises a guarantee'],
  [/\brisk[- ]free\b/i, 'Says "risk-free"'],
  [/\b(make|earn)\s+\$?\d[\d,]*\b|\$\d[\d,]*\s*(\/|per)\s*(month|mo|week|day)\b/i, 'Income or earnings claim'],
  [/\bpassive income\b|\bget rich\b|\bfinancial freedom\b/i, 'Income-opportunity language'],
  [/\b100%\b/i, 'Absolute claim ("100%")'],
  [/\b(act now|limited time|last chance|urgent)\b/i, 'Pressure language'],
  [/\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl)\b/i, 'Link shortener (hurts deliverability)'],
  [/\b(we('| ha)ve) (worked|spoken) (together|before)\b|\bas we discussed\b/i, 'Implies a relationship that does not exist'],
]

export function lintDraft({ channel, step, subject, body }, lead, db) {
  const issues = []
  const block = (msg) => issues.push({ level: 'block', msg })
  const warn = (msg) => issues.push({ level: 'warn', msg })
  const text = `${subject || ''}\n${body || ''}`
  if (!body || !body.trim()) block('Message is empty')
  if (/\{\{|\}\}|\[(first ?name|name|company|your name)\]|<(first ?name|company)>/i.test(text)) block('Unfilled placeholder')
  for (const [re, msg] of RISKY) if (re.test(text)) warn(msg)
  if (channel === 'email') {
    if (!lead.email) block('Lead has no email address')
    if (!subject || !subject.trim()) block('Email needs a subject')
    if (subject && subject.length > 90) warn('Subject is long (over 90 characters)')
    if (body && body.length > 1800) warn('Body is long for a cold email (over 1,800 characters)')
    if ((body?.match(/https?:\/\//g) || []).length > 2) warn('More than two links (hurts deliverability)')
  } else {
    if (!lead.linkedin_url) block('Lead has no LinkedIn profile URL')
    if (step === 1 && body && body.length > 300) block('LinkedIn connection notes max out at 300 characters')
    if (body && body.length > 1900) block('LinkedIn messages max out at about 1,900 characters')
  }
  const blocked = isSuppressed(db, lead)
  if (blocked) block(`On the do-not-contact list (${blocked.kind})`)
  if (channel === 'email' && step === 1 && lead.email) {
    const sender = getSender(db)
    const since = new Date(Date.now() - sender.recontact_days * 864e5).toISOString()
    const recent = db.prepare(`select 1 from messages m join leads l on l.id = m.lead_id
      where l.email = ? and m.lead_id != ? and m.status = 'sent' and m.sent_at > ? limit 1`).get(lead.email, lead.id, since)
    if (recent) block(`Already emailed from another campaign in the last ${sender.recontact_days} days`)
  }
  return issues
}

export function saveDrafts(db, drafts) {
  const saved = []
  tx(db, () => {
    for (const d of drafts) {
      const lead = db.prepare('select * from leads where id = ?').get(d.lead_id)
      if (!lead) { saved.push({ lead_id: d.lead_id, error: 'No such lead' }); continue }
      const channel = d.channel === 'linkedin' ? 'linkedin' : 'email'
      const step = Math.max(1, Math.min(5, Number(d.step) || 1))
      const subject = channel === 'email' ? clip(d.subject?.trim() || null, 200) : null
      const body = String(d.body || '').trim()
      const issues = lintDraft({ channel, step, subject, body }, lead, db)
      const existing = db.prepare(`select id from messages where lead_id = ? and channel = ? and step = ?
        and status in ('draft','approved')`).get(lead.id, channel, step)
      const t = now()
      let id
      if (existing) {
        id = existing.id
        db.prepare(`update messages set subject = ?, body = ?, status = 'draft', approved_at = null, issues_json = ?, updated_at = ? where id = ?`)
          .run(subject, body, JSON.stringify(issues), t, id)
      } else {
        id = newId()
        db.prepare(`insert into messages (id, lead_id, campaign_id, channel, step, subject, body, issues_json, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, lead.id, lead.campaign_id, channel, step, subject, body, JSON.stringify(issues), t, t)
      }
      if (['new', 'enriched'].includes(lead.status)) {
        db.prepare(`update leads set status = 'drafted', updated_at = ? where id = ?`).run(t, lead.id)
      }
      saved.push({ message_id: id, lead_id: lead.id, channel, step, issues })
    }
  })
  return saved
}

export function editMessage(db, id, { subject, body }) {
  const m = db.prepare('select * from messages where id = ?').get(id)
  if (!m) throw new Error(`No message ${id}`)
  if (!['draft', 'approved'].includes(m.status)) throw new Error(`Message is already ${m.status}`)
  return saveDrafts(db, [{ lead_id: m.lead_id, channel: m.channel, step: m.step, subject: subject ?? m.subject, body: body ?? m.body }])[0]
}

export function approveMessages(db, ids) {
  const sender = getSender(db)
  const out = []
  tx(db, () => {
    for (const id of ids) {
      const m = db.prepare('select * from messages where id = ?').get(id)
      if (!m) { out.push({ message_id: id, approved: false, reason: 'Not found' }); continue }
      if (m.status !== 'draft') { out.push({ message_id: id, approved: false, reason: `Already ${m.status}` }); continue }
      const lead = db.prepare('select * from leads where id = ?').get(m.lead_id)
      const issues = lintDraft(m, lead, db)
      const blocks = issues.filter((i) => i.level === 'block')
      if (m.channel === 'email') {
        const gaps = senderGaps(sender)
        if (gaps.length) blocks.push({ level: 'block', msg: `Finish your sender profile first: ${gaps.join(', ')}` })
      }
      db.prepare('update messages set issues_json = ? where id = ?').run(JSON.stringify(issues), id)
      if (blocks.length) { out.push({ message_id: id, approved: false, reason: blocks.map((b) => b.msg).join('; ') }); continue }
      db.prepare(`update messages set status = 'approved', approved_at = ?, updated_at = ? where id = ?`).run(now(), now(), id)
      logEvent(db, 'approved', m.lead_id, { message_id: id, channel: m.channel })
      out.push({ message_id: id, approved: true })
    }
  })
  return out
}

export function cancelMessages(db, ids) {
  let n = 0
  for (const id of ids) {
    n += db.prepare(`update messages set status = 'cancelled', updated_at = ? where id = ? and status in ('draft','approved')`)
      .run(now(), id).changes
  }
  return { cancelled: n }
}

export function listMessages(db, { campaign_id, status, channel, limit = 100 } = {}) {
  const where = []
  const args = []
  if (campaign_id) { where.push('m.campaign_id = ?'); args.push(campaign_id) }
  if (status) { where.push('m.status = ?'); args.push(status) }
  if (channel) { where.push('m.channel = ?'); args.push(channel) }
  return db.prepare(`select m.id, m.lead_id, m.campaign_id, m.channel, m.step, m.subject, m.body, m.status, m.issues_json,
      m.approved_at, m.sent_at, m.error, l.name as lead_name, l.company as lead_company, l.email as lead_email,
      l.linkedin_url as lead_linkedin_url, l.fit_score
    from messages m join leads l on l.id = m.lead_id
    ${where.length ? `where ${where.join(' and ')}` : ''}
    order by m.created_at limit ?`).all(...args, Math.min(limit, 500))
    .map(({ issues_json, ...m }) => ({ ...m, issues: JSON.parse(issues_json || '[]') }))
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function sentToday(db, channel) {
  return db.prepare(`select count(*) as n from messages where channel = ? and status = 'sent' and sent_at >= ?`)
    .get(channel, startOfToday()).n
}

// A follow-up is only due once the earlier step went out N days ago with no reply.
function followupDue(db, m, sender) {
  if (m.step === 1) return true
  if (db.prepare('select 1 from replies where lead_id = ? limit 1').get(m.lead_id)) return false
  const prev = db.prepare(`select sent_at from messages where lead_id = ? and channel = ? and step = ? and status = 'sent'`)
    .get(m.lead_id, m.channel, m.step - 1)
  if (!prev) return false
  return Date.now() - Date.parse(prev.sent_at) >= sender.followup_days * 864e5
}

export function dueMessages(db, channel) {
  const sender = getSender(db)
  const cap = channel === 'email' ? sender.daily_email_cap : sender.daily_linkedin_cap
  const remaining = Math.max(0, cap - sentToday(db, channel))
  if (!remaining) return { remaining: 0, cap, messages: [] }
  const approved = db.prepare(`select m.*, l.name, l.company, l.email, l.linkedin_url, l.domain
    from messages m join leads l on l.id = m.lead_id
    where m.channel = ? and m.status = 'approved' order by m.step, m.approved_at`).all(channel)
  const due = []
  for (const m of approved) {
    if (due.length >= remaining) break
    if (isSuppressed(db, m)) {
      db.prepare(`update messages set status = 'cancelled', updated_at = ? where id = ?`).run(now(), m.id)
      continue
    }
    if (followupDue(db, m, sender)) due.push(m)
  }
  return { remaining, cap, messages: due }
}

export function linkedinQueue(db) {
  const { remaining, cap, messages } = dueMessages(db, 'linkedin')
  return {
    remaining_today: remaining,
    daily_cap: cap,
    how_it_works: 'Open each profile, paste the note, and send it yourself. Then mark it sent here.',
    items: messages.map((m) => ({
      message_id: m.id, lead_id: m.lead_id, name: m.name, company: m.company, step: m.step,
      profile_url: m.linkedin_url, note: m.body, kind: m.step === 1 ? 'connection note' : 'message',
    })),
  }
}

export function composeEmail(db, m) {
  const sender = getSender(db)
  const footer = [
    '',
    '--',
    sender.signature || [sender.name, sender.title].filter(Boolean).join(', '),
    `${sender.company} · ${sender.postal_address}`,
    'Not a fit? Reply "stop" and I won\'t email you again.',
  ].join('\n')
  const unsubscribe = `mailto:${sender.reply_email}?subject=${encodeURIComponent('stop')}`
  return {
    from: { name: sender.name, address: sender.reply_email },
    to: m.email,
    subject: m.subject,
    text: `${m.body}\n${footer}`,
    headers: { 'List-Unsubscribe': `<${unsubscribe}>` },
  }
}

export function markSent(db, messageId, { external_id, at } = {}) {
  return tx(db, () => {
    const m = db.prepare('select * from messages where id = ?').get(messageId)
    if (!m) throw new Error(`No message ${messageId}`)
    if (m.status !== 'approved') throw new Error(`Only approved messages can be marked sent (this one is ${m.status})`)
    const t = at || now()
    db.prepare(`update messages set status = 'sent', sent_at = ?, external_id = ?, error = null, updated_at = ? where id = ?`)
      .run(t, external_id || null, now(), messageId)
    db.prepare(`update leads set last_contacted_at = ?,
      status = case when status in ('new','enriched','drafted') then 'contacted' else status end, updated_at = ? where id = ?`)
      .run(t, now(), m.lead_id)
    logEvent(db, 'sent', m.lead_id, { message_id: messageId, channel: m.channel, step: m.step })
    return { message_id: messageId, sent_at: t }
  })
}

export function markFailed(db, messageId, error) {
  db.prepare(`update messages set status = 'failed', error = ?, updated_at = ? where id = ?`)
    .run(clip(String(error), 500), now(), messageId)
  const m = db.prepare('select lead_id from messages where id = ?').get(messageId)
  if (m) logEvent(db, 'send_failed', m.lead_id, { message_id: messageId, error: String(error) })
}

export function logReply(db, { lead_id, message_id, channel = 'email', received_at, text, sentiment = 'neutral', intent = 'none' }) {
  return tx(db, () => {
    const lead = db.prepare('select * from leads where id = ?').get(lead_id)
    if (!lead) throw new Error(`No lead ${lead_id}`)
    const at = received_at || now()
    const id = newId()
    db.prepare(`insert into replies (id, lead_id, message_id, channel, received_at, text, sentiment, intent, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, lead_id, message_id || null, channel, at, clip(text || null, 5000), sentiment, intent, now())
    db.prepare('update leads set first_reply_at = coalesce(first_reply_at, ?), updated_at = ? where id = ?').run(at, now(), lead_id)
    // Any reply stops the automated follow-ups; the human takes it from here.
    db.prepare(`update messages set status = 'cancelled', updated_at = ? where lead_id = ? and status in ('draft','approved') and step > 1`)
      .run(now(), lead_id)
    if (intent === 'unsubscribe') {
      if (lead.email) suppress(db, { kind: 'email', value: lead.email, reason: 'Asked to stop' })
      if (lead.linkedin_url) suppress(db, { kind: 'linkedin', value: lead.linkedin_url, reason: 'Asked to stop' })
    } else {
      const status = STATUS_FROM_INTENT[intent] || 'replied'
      db.prepare('update leads set status = ? where id = ?').run(status, lead_id)
    }
    logEvent(db, 'reply', lead_id, { channel, intent, sentiment })
    const scores = recomputeLead(db, lead_id)
    return { reply_id: id, ...scores }
  })
}

export function personalGreeting(lead) {
  return firstName(lead.name) || 'there'
}
