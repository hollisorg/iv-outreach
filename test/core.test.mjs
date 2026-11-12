import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as lw from '../src/core/index.js'
import { robotsAllows, safeFetch, extractFromHtml } from '../src/core/enrich.js'
import { engagementFrom } from '../src/core/scoring.js'

const fresh = () => lw.openDb(':memory:')
const fullSender = {
  name: 'Test Sender', company: 'Example Co (fictional)', postal_address: '1 Test St, Nowhere, ZZ 00000',
  reply_email: 'sender@example.test', daily_email_cap: 2, daily_linkedin_cap: 2, followup_days: 3,
}

function campaign(db) {
  return lw.createCampaign(db, {
    name: 'Test plumbers', offer: 'Fictional offer',
    icp: { industries: ['Plumbing'], titles: ['Owner'], locations: ['Testville'], notes: '' },
  })
}

test('adds leads with dedupe, cleaning and suppression', () => {
  const db = fresh()
  const c = campaign(db)
  lw.suppress(db, { kind: 'domain', value: 'blocked.test', reason: 'test' })
  const r = lw.addLeads(db, c.id, [
    { name: 'Ann Able', company: 'Able Plumbing', website: 'able.test', email: ' ANN@Able.test ', source: 'claude_research' },
    { name: 'Ann A.', email: 'ann@able.test' }, // duplicate email
    { company: 'Blocked Pipes', website: 'https://www.blocked.test/' },
    { linkedin_url: 'https://linkedin.com/in/Bob-Builder/?trk=x' },
    { linkedin_url: 'https://www.linkedin.com/in/bob-builder' }, // duplicate LinkedIn
    {}, // invalid
  ])
  assert.equal(r.added.length, 3)
  assert.equal(r.duplicates, 2)
  assert.equal(r.invalid, 1)
  assert.equal(r.suppressed, 1)
  const ann = lw.listLeads(db, { campaign_id: c.id }).find((l) => l.name === 'Ann Able')
  assert.equal(ann.email, 'ann@able.test')
  assert.equal(ann.domain, 'able.test')
  assert.equal(ann.email_status, 'provided')
  const bob = lw.listLeads(db, { campaign_id: c.id }).find((l) => l.linkedin_url)
  assert.equal(bob.linkedin_url, 'https://www.linkedin.com/in/bob-builder')
})

test('imports CSV with common export headers', () => {
  const db = fresh()
  const c = campaign(db)
  const dir = mkdtempSync(join(tmpdir(), 'lw-'))
  const file = join(dir, 'leads.csv')
  writeFileSync(file, '\uFEFFFirst Name,Last Name,Company Name,Job Title,Email Address,Person Linkedin Url,Website\r\n' +
    'Cara,Cole,"Cole, Pipes & Co",Owner,cara@cole.test,https://linkedin.com/in/caracole,cole.test\r\n' +
    'Dan,Dee,Dee Drains,"Owner, ""Founder""",,,\r\n')
  const r = lw.importCsv(db, c.id, file)
  assert.equal(r.rows, 2)
  assert.equal(r.added.length, 2)
  const cara = lw.listLeads(db, { campaign_id: c.id }).find((l) => l.name === 'Cara Cole')
  assert.equal(cara.company, 'Cole, Pipes & Co')
  assert.equal(cara.source, 'csv')
  assert.match(lw.exportCsv(db, c.id), /"Cole, Pipes & Co"/)
})

test('robots.txt rules are honoured', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: OtherBot\nDisallow: /'
  assert.equal(robotsAllows(robots, '/'), true)
  assert.equal(robotsAllows(robots, '/private/x'), false)
  assert.equal(robotsAllows(robots, '/private/ok/page'), true)
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/contact'), false)
  assert.equal(robotsAllows('', '/anything'), true)
})

test('refuses to fetch private network addresses', async () => {
  await assert.rejects(safeFetch('http://127.0.0.1:9/'), /non-public/)
  await assert.rejects(safeFetch('http://localhost/'), /non-public/)
  await assert.rejects(safeFetch('http://192.168.1.1/'), /non-public/)
  await assert.rejects(safeFetch('file:///c:/windows/win.ini'), /http/)
})

test('extracts published emails and the business\'s own social links', () => {
  const html = `<title>Able Plumbing</title><meta name="description" content="Family plumbers">
    <a href="mailto:info@able.test?subject=hi">Email</a> Write to owner&#64;able.test
    <img src="logo@2x.png"> <a href="https://www.linkedin.com/company/able-plumbing/">in</a>
    <a href="https://facebook.com/sharer.php?u=x">share</a> <a href="https://facebook.com/ableplumbing">fb</a>
    <script>var x="hidden@tracker.test"</script>`
  const r = extractFromHtml(html, 'https://able.test/')
  assert.deepEqual(r.emails.sort(), ['info@able.test', 'owner@able.test'])
  assert.equal(r.socials.linkedin, 'https://www.linkedin.com/company/able-plumbing')
  assert.equal(r.socials.facebook, 'https://facebook.com/ableplumbing')
  assert.equal(r.title, 'Able Plumbing')
})

test('enriches leads from a local test site, skipping robots-blocked pages', async () => {
  const hits = []
  const srv = createServer((req, res) => {
    hits.push(req.url)
    if (req.url === '/robots.txt') return res.end('User-agent: *\nDisallow: /about')
    if (req.url === '/') return res.end('<title>Able</title><p>We fix pipes.</p><a href="/contact">Contact</a>')
    if (req.url === '/contact') return res.end('<a href="mailto:office@127.0.0.1.test">x</a> Call us. owner@able.test')
    res.statusCode = 404
    res.end()
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const port = srv.address().port
  try {
    const db = fresh()
    const c = campaign(db)
    const { added } = lw.addLeads(db, c.id, [{ name: 'Ann Able', company: 'Able', website: `http://127.0.0.1:${port}/` }])
    const r = await lw.enrichLeads(db, { campaign_id: c.id, allowPrivate: true })
    assert.equal(r.results[0].ok, true, JSON.stringify(r))
    const lead = lw.getLead(db, added[0])
    assert.equal(lead.status, 'enriched')
    assert.ok(lead.email, 'found a published email')
    assert.equal(lead.email_status, 'found_on_site')
    assert.match(lead.site_summary, /We fix pipes/)
    assert.ok(!hits.includes('/about'), 'did not fetch robots-disallowed page')
  } finally {
    srv.close()
  }
})

test('drafts are checked, approval needs a sender profile, and nothing is approved with blocking issues', () => {
  const db = fresh()
  const c = campaign(db)
  const { added: [annId, bobId] } = lw.addLeads(db, c.id, [
    { name: 'Ann Able', company: 'Able', email: 'ann@able.test' },
    { name: 'Bob B', linkedin_url: 'https://linkedin.com/in/bobb' },
  ])
  const [good, placeholder, tooLong, noEmail] = lw.saveDrafts(db, [
    { lead_id: annId, channel: 'email', subject: 'Quick idea for Able', body: 'Hi Ann, saw your new van fleet.' },
    { lead_id: annId, channel: 'email', step: 2, subject: 'Re: idea', body: 'Hi {{first_name}}, following up.' },
    { lead_id: bobId, channel: 'linkedin', body: 'x'.repeat(301) },
    { lead_id: bobId, channel: 'email', subject: 'Hi', body: 'Guaranteed results, risk-free!' },
  ])
  assert.deepEqual(good.issues, [])
  assert.ok(placeholder.issues.some((i) => i.level === 'block' && /placeholder/i.test(i.msg)))
  assert.ok(tooLong.issues.some((i) => i.level === 'block' && /300/.test(i.msg)))
  assert.ok(noEmail.issues.some((i) => /no email/i.test(i.msg)))
  assert.ok(noEmail.issues.some((i) => /guarantee/i.test(i.msg)))

  const first = lw.approveMessages(db, [good.message_id])
  assert.equal(first[0].approved, false)
  assert.match(first[0].reason, /postal address/)

  lw.saveSender(db, fullSender)
  const results = lw.approveMessages(db, [good.message_id, placeholder.message_id, tooLong.message_id])
  assert.deepEqual(results.map((r) => r.approved), [true, false, false])
})

test('daily cap, follow-up timing, replies and opt-outs', () => {
  const db = fresh()
  lw.saveSender(db, fullSender)
  const c = campaign(db)
  const { added } = lw.addLeads(db, c.id, ['a', 'b', 'c'].map((x) => ({ name: `${x.toUpperCase()} Lead`, email: `${x}@lead.test` })))
  lw.setFitScores(db, added.map((id, i) => ({ lead_id: id, fit_score: 60 + i * 10, reason: 'test' })))
  const drafts = lw.saveDrafts(db, added.flatMap((id) => [
    { lead_id: id, channel: 'email', step: 1, subject: 'Idea', body: 'Hi, a real specific note.' },
    { lead_id: id, channel: 'email', step: 2, subject: 'Re: Idea', body: 'Hi, one short follow-up.' },
  ]))
  lw.approveMessages(db, drafts.map((d) => d.message_id))

  // Cap of 2: only two first-touch emails today; follow-ups are not due yet.
  let due = lw.dueMessages(db, 'email')
  assert.equal(due.messages.length, 2)
  assert.ok(due.messages.every((m) => m.step === 1))
  const composed = lw.composeEmail(db, due.messages[0])
  assert.match(composed.text, /Reply "stop"/)
  assert.match(composed.text, /1 Test St/)
  assert.match(composed.headers['List-Unsubscribe'], /^<mailto:sender@example\.test\?subject=stop>$/)

  const fourDaysAgo = new Date(Date.now() - 4 * 864e5).toISOString()
  for (const m of due.messages) lw.markSent(db, m.id, { at: fourDaysAgo })
  // Sent "4 days ago", so today's cap is free again and follow-ups are due.
  due = lw.dueMessages(db, 'email')
  assert.equal(due.messages.length, 2)

  // Lead A replies fast and interested; lead B says stop.
  const [a, b] = due.messages.map((m) => m.lead_id)
  const replyAt = new Date(Date.parse(fourDaysAgo) + 30 * 60e3).toISOString()
  lw.logReply(db, { lead_id: a, received_at: replyAt, sentiment: 'positive', intent: 'interested', text: 'Yes, call me' })
  lw.logReply(db, { lead_id: b, intent: 'unsubscribe', text: 'stop' })
  const leadA = lw.getLead(db, a)
  assert.equal(leadA.status, 'interested')
  assert.ok(leadA.messages.filter((m) => m.step === 2).every((m) => m.status === 'cancelled'), 'follow-up cancelled after reply')
  assert.equal(lw.getLead(db, b).status, 'suppressed')
  assert.ok(lw.isSuppressed(db, { email: lw.getLead(db, b).email }))
  const ranked = lw.listLeads(db, { campaign_id: c.id, sort: 'rank' })
  assert.equal(ranked[0].id, a, 'interested replier ranks first')

  // Stop request also blocks the same person in another campaign.
  const c2 = campaign(db)
  const r = lw.addLeads(db, c2.id, [{ name: 'Again', email: lw.getLead(db, b).email }])
  assert.equal(r.suppressed, 1)
})

test('LinkedIn is a manual send list, not automation', () => {
  const db = fresh()
  lw.saveSender(db, fullSender)
  const c = campaign(db)
  const { added: [id] } = lw.addLeads(db, c.id, [{ name: 'Lin Kd', linkedin_url: 'https://www.linkedin.com/in/linkd' }])
  const [d] = lw.saveDrafts(db, [{ lead_id: id, channel: 'linkedin', body: 'Hi Lin, saw your post on hiring techs.' }])
  lw.approveMessages(db, [d.message_id])
  const q = lw.linkedinQueue(db)
  assert.equal(q.items.length, 1)
  assert.equal(q.items[0].profile_url, 'https://www.linkedin.com/in/linkd')
  assert.equal(q.items[0].kind, 'connection note')
  lw.markSent(db, d.message_id)
  assert.equal(lw.getLead(db, id).status, 'contacted')
  assert.equal(lw.overview(db).today.linkedin_sent, 1)
})

test('engagement scoring rewards fast, interested replies', () => {
  const sent = '2026-01-01T00:00:00.000Z'
  const fast = engagementFrom({ firstSentAt: sent, replies: [{ received_at: '2026-01-01T00:20:00.000Z', sentiment: 'positive', intent: 'interested' }] })
  const slow = engagementFrom({ firstSentAt: sent, replies: [{ received_at: '2026-01-06T00:00:00.000Z', sentiment: 'neutral', intent: 'none' }] })
  const no = engagementFrom({ firstSentAt: sent, replies: [{ received_at: '2026-01-01T01:00:00.000Z', sentiment: 'negative', intent: 'not_interested' }] })
  assert.ok(fast > slow && slow > no, `${fast} > ${slow} > ${no}`)
  assert.equal(engagementFrom({ firstSentAt: sent, replies: [] }), 0)
})
