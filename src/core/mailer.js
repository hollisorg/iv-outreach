// Email from the person's own mailbox: send approved messages within the daily cap (SMTP, nodemailer), and read
// replies back (IMAP, imapflow) so they're logged, ranked, and "stop" requests go on the do-not-contact list.
// The mailbox password never lives here: callers pass it in (the desktop app keeps it in Electron safeStorage).
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { getSetting, setSetting, now, logEvent } from './db.js'
import { dueMessages, composeEmail, markSent, markFailed, logReply, getSender } from './outreach.js'
import { normEmail } from './normalize.js'

export const PRESETS = {
  gmail: { label: 'Gmail / Google Workspace', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true, imap_host: 'imap.gmail.com', imap_port: 993, note: 'Use an app password (Google Account → Security → 2-Step Verification → App passwords).' },
  outlook: { label: 'Outlook / Microsoft 365', smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com', imap_port: 993, note: 'Your organization must allow SMTP AUTH for the mailbox.' },
  other: { label: 'Other (enter servers)', smtp_host: '', smtp_port: 587, smtp_secure: false, imap_host: '', imap_port: 993, note: '' },
}

const DEFAULT_MAILBOX = { provider: 'gmail', user: '', smtp_host: PRESETS.gmail.smtp_host, smtp_port: 465, smtp_secure: true, imap_host: PRESETS.gmail.imap_host, imap_port: 993, auto_send: false, min_gap_seconds: 90 }

export function getMailbox(db) {
  return { ...DEFAULT_MAILBOX, ...(getSetting(db, 'mailbox', {}) || {}) }
}

export function saveMailbox(db, patch) {
  const next = { ...getMailbox(db) }
  if (patch.provider && PRESETS[patch.provider] && patch.provider !== next.provider) {
    const p = PRESETS[patch.provider]
    Object.assign(next, { provider: patch.provider, smtp_host: p.smtp_host, smtp_port: p.smtp_port, smtp_secure: p.smtp_secure, imap_host: p.imap_host, imap_port: p.imap_port })
  }
  for (const k of ['user', 'smtp_host', 'imap_host']) if (typeof patch[k] === 'string') next[k] = patch[k].trim()
  for (const k of ['smtp_port', 'imap_port']) if (patch[k] != null) next[k] = Math.max(1, Math.min(65535, Number(patch[k]) || next[k]))
  if (patch.smtp_secure != null) next.smtp_secure = !!patch.smtp_secure
  if (patch.auto_send != null) next.auto_send = !!patch.auto_send
  // a human pace between sends: no faster than one a minute
  if (patch.min_gap_seconds != null) next.min_gap_seconds = Math.max(60, Math.min(3600, Number(patch.min_gap_seconds) || 90))
  setSetting(db, 'mailbox', next)
  return next
}

export const mailboxReady = (mb) => !!(mb.user && mb.smtp_host && mb.imap_host)

export function makeTransport(mb, password, { transportFactory = nodemailer.createTransport } = {}) {
  return transportFactory({
    host: mb.smtp_host,
    port: mb.smtp_port,
    secure: mb.smtp_secure,
    auth: { user: mb.user, pass: password },
    connectionTimeout: 20000,
  })
}

export function makeImap(mb, password) {
  return new ImapFlow({ host: mb.imap_host, port: mb.imap_port, secure: true, auth: { user: mb.user, pass: password }, logger: false })
}

// Checks both servers with the password. Returns { smtp, imap } with ok/error each.
export async function testMailbox(mb, password) {
  const out = { smtp: { ok: false }, imap: { ok: false } }
  try {
    await makeTransport(mb, password).verify()
    out.smtp.ok = true
  } catch (e) {
    out.smtp.error = e.message
  }
  const client = makeImap(mb, password)
  try {
    await client.connect()
    out.imap.ok = true
  } catch (e) {
    out.imap.error = e.message
  } finally {
    try { await client.logout() } catch { /* already closed */ }
  }
  return out
}

// Sends at most one due email, honouring the daily cap, the do-not-contact list, follow-up timing and the minimum
// gap since the last send. Returns { sent, message_id?, waiting? , error? }.
export async function sendNext(db, transport, { minGapSeconds = 90 } = {}) {
  const last = db.prepare(`select max(sent_at) as at from messages where channel = 'email' and status = 'sent'`).get().at
  if (last && Date.now() - Date.parse(last) < minGapSeconds * 1000) return { sent: false, waiting: 'pace' }
  const { messages, remaining } = dueMessages(db, 'email')
  if (!remaining) return { sent: false, waiting: 'daily_cap' }
  const m = messages[0]
  if (!m) return { sent: false, waiting: 'nothing_due' }
  const mail = composeEmail(db, m)
  try {
    const info = await transport.sendMail(mail)
    markSent(db, m.id, { external_id: info.messageId || null })
    return { sent: true, message_id: m.id, to: mail.to }
  } catch (e) {
    // a hard bounce at send time (5xx for the recipient): mark the address bad so nobody tries it again
    if (/^5\d\d/.test(String(e.responseCode || '')) && /recipient|mailbox|user unknown|does not exist|no such user/i.test(e.response || e.message)) {
      db.prepare(`update leads set email_status = 'bounced', updated_at = ? where id = ?`).run(now(), m.lead_id)
    }
    markFailed(db, m.id, e.message)
    return { sent: false, message_id: m.id, error: e.message }
  }
}

const STOP = /\b(stop|unsubscribe|remove me|take me off|do not (contact|email)|don'?t (contact|email))\b/i
const NO = /\b(not interested|no thanks|no thank you|we'?re all set|not a fit)\b/i
const YES = /\b(interested|sounds good|let'?s (talk|chat)|call me|book|schedule|tell me more|send (me )?(more|details|info))\b/i

// A first guess at what a reply means; the chat can reclassify it.
export function classifyReply(text = '') {
  const t = String(text).split(/\n(?:On .+wrote:|-{2,}\s*Original Message|From: )/)[0].slice(0, 2000)
  if (STOP.test(t)) return { intent: 'unsubscribe', sentiment: 'negative' }
  if (NO.test(t)) return { intent: 'not_interested', sentiment: 'negative' }
  if (YES.test(t)) return { intent: 'interested', sentiment: 'positive' }
  if (/\?/.test(t)) return { intent: 'question', sentiment: 'neutral' }
  return { intent: 'none', sentiment: 'neutral' }
}

// Bounce notices name the address that failed.
export function bouncedAddress(parsed) {
  const from = parsed.from?.value?.[0]?.address || ''
  if (!/mailer-daemon|postmaster/i.test(from) && !/undeliver|delivery status|returned mail|failure notice/i.test(parsed.subject || '')) return null
  const m = String(parsed.text || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []
  return m.map(normEmail).find((e) => e && !/mailer-daemon|postmaster/i.test(e)) || null
}

// Logs one parsed incoming message against the leads we've emailed. Returns what happened.
export function handleIncoming(db, parsed) {
  const bounced = bouncedAddress(parsed)
  if (bounced) {
    const r = db.prepare(`update leads set email_status = 'bounced', updated_at = ? where email = ?`).run(now(), bounced)
    if (r.changes) logEvent(db, 'bounced', null, { email: bounced })
    return r.changes ? { kind: 'bounce', email: bounced } : null
  }
  const from = normEmail(parsed.from?.value?.[0]?.address)
  if (!from) return null
  // the most recently contacted lead with that address
  const lead = db.prepare(`select l.id from leads l where l.email = ? and exists
    (select 1 from messages m where m.lead_id = l.id and m.channel = 'email' and m.status = 'sent') order by l.last_contacted_at desc limit 1`).get(from)
  if (!lead) return null
  const text = String(parsed.text || '').trim()
  const { intent, sentiment } = classifyReply(`${parsed.subject || ''}\n${text}`)
  const received = parsed.date ? new Date(parsed.date).toISOString() : now()
  const dup = db.prepare('select 1 from replies where lead_id = ? and received_at = ?').get(lead.id, received)
  if (dup) return null
  logReply(db, { lead_id: lead.id, channel: 'email', received_at: received, text: text.slice(0, 4000), intent, sentiment })
  return { kind: 'reply', lead_id: lead.id, intent }
}

// Reads new INBOX mail since the last check (looking back at most 14 days the first time).
export async function checkReplies(db, client, { mailbox = 'INBOX', lookbackDays = 14 } = {}) {
  const out = { checked: 0, replies: 0, bounces: 0 }
  await client.connect()
  const lock = await client.getMailboxLock(mailbox)
  try {
    const since = new Date(Date.now() - lookbackDays * 864e5)
    const uids = (await client.search({ since }, { uid: true })) || []
    const seen = db.prepare('select 1 from mail_seen where mailbox = ? and uid = ?')
    const fresh = uids.filter((u) => !seen.get(mailbox, u)).slice(-200)
    for await (const msg of client.fetch(fresh, { source: true, uid: true }, { uid: true })) {
      out.checked++
      try {
        const parsed = await simpleParser(msg.source)
        const r = handleIncoming(db, parsed)
        if (r?.kind === 'reply') out.replies++
        if (r?.kind === 'bounce') out.bounces++
      } catch { /* one unreadable message shouldn't stop the rest */ }
      db.prepare('insert or ignore into mail_seen (mailbox, uid) values (?, ?)').run(mailbox, msg.uid)
    }
  } finally {
    lock.release()
    try { await client.logout() } catch { /* already closed */ }
  }
  setSetting(db, 'mail_last_check', { at: now(), ...out })
  return out
}

export function mailStatus(db) {
  const mb = getMailbox(db)
  const due = dueMessages(db, 'email')
  return {
    mailbox: { ...mb },
    ready: mailboxReady(mb),
    sender_from: getSender(db).reply_email,
    approved_waiting: db.prepare(`select count(*) as n from messages where channel = 'email' and status = 'approved'`).get().n,
    due_now: due.messages.length,
    remaining_today: due.remaining,
    last_check: getSetting(db, 'mail_last_check', null),
    failed: db.prepare(`select count(*) as n from messages where channel = 'email' and status = 'failed'`).get().n,
  }
}
