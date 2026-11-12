// Social channels, Google Maps mapping, username lookup and email sending/replies. No outside network: local servers only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SMTPServer } from 'smtp-server'
import nodemailer from 'nodemailer'
import * as fs from '../src/core/index.js'
import { MIGRATIONS } from '../src/core/db.js'
import { placeToLead } from '../src/core/gmaps.js'

const fresh = () => fs.openDb(':memory:')
const sender = { name: 'Test Sender', company: 'Fictional Co', postal_address: '1 Test St, Nowhere ZZ 00000', reply_email: 'sender@example.test', daily_email_cap: 5, daily_social_cap: 2 }
const camp = (db) => fs.createCampaign(db, { name: 'Test', offer: 'x', icp: {} })

test('an old database upgrades without losing messages or replies', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fs-mig-')), 'old.db')
  const old = new DatabaseSync(file)
  old.exec('create table schema_version (version integer not null); insert into schema_version values (1);')
  old.exec(MIGRATIONS[0])
  const t = new Date().toISOString()
  old.prepare(`insert into campaigns (id, name, created_at, updated_at) values ('c', 'Old', ?, ?)`).run(t, t)
  old.prepare(`insert into leads (id, campaign_id, name, email, created_at, updated_at) values ('l', 'c', 'Ann', 'ann@x.test', ?, ?)`).run(t, t)
  old.prepare(`insert into messages (id, lead_id, campaign_id, channel, body, status, created_at, updated_at) values ('m', 'l', 'c', 'linkedin', 'Hi', 'sent', ?, ?)`).run(t, t)
  old.prepare(`insert into replies (id, lead_id, message_id, channel, received_at, created_at) values ('r', 'l', 'm', 'linkedin', ?, ?)`).run(t, t)
  old.close()
  const db = fs.openDb(file)
  assert.equal(db.prepare('select version from schema_version').get().version, MIGRATIONS.length)
  assert.equal(db.prepare('select count(*) n from messages').get().n, 1)
  assert.equal(db.prepare('select message_id from replies').get().message_id, 'm')
  assert.equal(db.prepare('pragma foreign_keys').get().foreign_keys, 1)
  // new channels and columns work
  const [d] = fs.saveDrafts(db, [{ lead_id: 'l', channel: 'instagram', body: 'Hi Ann' }])
  assert.ok(d.issues.some((i) => /Instagram profile/.test(i.msg)))
  db.prepare('update leads set rating = 4.8, review_count = 120 where id = ?').run('l')
})

test('social drafts need a profile, respect limits, and come with DM links', () => {
  const db = fresh()
  fs.saveSender(db, sender)
  const c = camp(db)
  const { added: [id] } = fs.addLeads(db, c.id, [{ company: 'Able (fictional)', website: 'able.test' }])
  db.prepare('update leads set socials_json = ? where id = ?').run(JSON.stringify({ instagram: 'https://www.instagram.com/able.plumbing/', facebook: 'https://www.facebook.com/AblePlumbing', x: 'https://x.com/able' }), id)
  const [ig, fb, xMsg, tooLong, tt] = fs.saveDrafts(db, [
    { lead_id: id, channel: 'instagram', body: 'Hi! Loved the van wrap.' },
    { lead_id: id, channel: 'facebook', body: 'Hi there, quick question.' },
    { lead_id: id, channel: 'x', body: 'Hey, quick idea.' },
    { lead_id: id, channel: 'instagram', step: 2, body: 'x'.repeat(1001) },
    { lead_id: id, channel: 'tiktok', body: 'Hi' },
  ])
  assert.deepEqual(ig.issues, [])
  assert.ok(tooLong.issues.some((i) => /1,000/.test(i.msg)))
  assert.ok(tt.issues.some((i) => /TikTok profile/.test(i.msg)))
  fs.approveMessages(db, [ig.message_id, fb.message_id, xMsg.message_id])
  const q = fs.socialQueue(db)
  const by = Object.fromEntries(q.items.map((i) => [i.channel, i]))
  assert.equal(by.instagram.open_url, 'https://ig.me/m/able.plumbing')
  assert.equal(by.facebook.open_url, 'https://m.me/AblePlumbing')
  assert.equal(by.x.open_url, 'https://x.com/able')
  assert.equal(q.channels.instagram.daily_cap, 2)
  fs.markSent(db, ig.message_id)
  assert.equal(fs.overview(db).today.social_sent, 1)
})

test('Google Maps listings map to clean leads', () => {
  const lead = placeToLead({
    title: 'Eco Plumbers (fictional)', categories: ['Plumber', 'HVAC contractor'], address: '27 E Home St, Westerville, OH',
    web_site: 'https://geteco.example/?utm_source=GMB&utm_medium=organic&page=2', phone: '(614)555-0100', review_count: 1511, review_rating: 4.9, data_id: '0x1:0x2',
  }, 'plumbers in Westerville')
  assert.equal(lead.website, 'https://geteco.example/?page=2')
  assert.equal(lead.source, 'google_maps')
  assert.match(lead.notes, /4\.9★ from 1511 Google reviews/)
  assert.equal(lead._maps.category, 'Plumber')
  const db = fresh()
  const c = camp(db)
  assert.equal(fs.addLeads(db, c.id, [lead, { ...lead }]).added.length, 1, 'same listing twice is one lead')
  assert.equal(fs.addLeads(db, c.id, [{ company: 'No Site Co', phone: '555', source: 'google_maps' }, { company: 'No Site Co', phone: '555' }]).added.length, 1)
})

test('username lookup: own-site handles are confirmed, guessed same-name accounts are not', async () => {
  const srv = createServer((req, res) => {
    const [, site, user] = req.url.split('/')
    const exists = (site === 'social' && ['ableplumbing', 'able'].includes(user)) || (site === 'video' && user === 'able')
    res.statusCode = exists ? 200 : 404
    res.end(exists ? `<div class="profile">${user}</div>` : 'not found')
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const sites = [
    { name: 'Instagram', cat: 'social', uri_check: `${base}/social/{account}`, e_code: 200, e_string: 'class="profile"', m_code: 404, m_string: 'not found' },
    { name: 'YouTube User2', cat: 'video', uri_check: `${base}/video/{account}`, e_code: 200, e_string: 'class="profile"', m_code: 404, m_string: 'not found' },
  ]
  try {
    const db = fresh()
    const c = camp(db)
    const { added: [id] } = fs.addLeads(db, c.id, [{ company: 'Able', website: 'ableplumbing.test' }])
    db.prepare('update leads set socials_json = ? where id = ?').run(JSON.stringify({ x: 'https://x.com/able' }), id)
    const handles = fs.candidateHandles(db.prepare('select * from leads where id = ?').get(id))
    assert.deepEqual(handles, [{ handle: 'able', confirmed: true }, { handle: 'ableplumbing', confirmed: false }])
    const r = await fs.findSocials(db, id, { sites, concurrency: 2 })
    // "able" came from their own X link: its YouTube and Instagram hits are confirmed and fill in profiles
    assert.equal(r.socials.youtube, `${base}/video/able`)
    assert.equal(r.socials.instagram, `${base}/social/able`)
    const guessed = r.socials.found.find((f) => f.handle === 'ableplumbing')
    assert.equal(guessed.confirmed, false)
    // confirming one by hand
    const s = fs.useSocial(db, id, { channel: 'instagram', url: 'https://www.instagram.com/ableplumbing/' })
    assert.equal(s.instagram, 'https://www.instagram.com/ableplumbing/')
  } finally {
    srv.close()
  }
})

test('email: sends from the mailbox at a human pace, marks bounces, and reads replies', async () => {
  const received = []
  const smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'],
    onRcptTo(addr, _s, cb) { return addr.address.startsWith('bad') ? cb(Object.assign(new Error('550 5.1.1 User unknown'), { responseCode: 550 })) : cb() },
    onData(stream, _s, cb) { let d = ''; stream.on('data', (c) => (d += c)); stream.on('end', () => { received.push(d); cb() }) },
  })
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r))
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: smtp.server.address().port, secure: false, ignoreTLS: true })
  try {
    const db = fresh()
    fs.saveSender(db, sender)
    const c = camp(db)
    const { added: [good, bad] } = fs.addLeads(db, c.id, [{ name: 'Ann', email: 'ann@lead.test' }, { name: 'Bob', email: 'bad@lead.test' }])
    const drafts = fs.saveDrafts(db, [
      { lead_id: good, channel: 'email', subject: 'Quick idea', body: 'Hi Ann, a fictional note.' },
      { lead_id: bad, channel: 'email', subject: 'Quick idea', body: 'Hi Bob, a fictional note.' },
    ])
    fs.approveMessages(db, drafts.map((d) => d.message_id))
    const first = await fs.sendNext(db, transport, { minGapSeconds: 90 })
    assert.equal(first.sent, true)
    assert.match(received[0], /List-Unsubscribe: <mailto:sender@example\.test\?subject=stop>/)
    assert.match(received[0], /1 Test St/)
    assert.equal((await fs.sendNext(db, transport, { minGapSeconds: 90 })).waiting, 'pace', 'waits between sends')
    const second = await fs.sendNext(db, transport, { minGapSeconds: 0 })
    assert.equal(second.sent, false)
    assert.equal(db.prepare('select email_status from leads where id = ?').get(bad).email_status, 'bounced')

    // a real reply from Ann, then a stop
    const r1 = fs.handleIncoming(db, { from: { value: [{ address: 'Ann@Lead.test' }] }, subject: 'Re: Quick idea', text: 'Sounds good, call me Thursday.', date: new Date() })
    assert.equal(r1.intent, 'interested')
    assert.equal(fs.getLead(db, good).status, 'interested')
    const r2 = fs.handleIncoming(db, { from: { value: [{ address: 'ann@lead.test' }] }, subject: 'Re', text: 'Please stop emailing me.\n\nOn Tue someone wrote: interested?', date: new Date(Date.now() + 1000) })
    assert.equal(r2.intent, 'unsubscribe')
    assert.equal(fs.getLead(db, good).status, 'suppressed')
    // strangers and bounce notices
    assert.equal(fs.handleIncoming(db, { from: { value: [{ address: 'random@else.test' }] }, text: 'hi' }), null)
    assert.equal(fs.classifyReply('What does it cost?').intent, 'question')
  } finally {
    smtp.close()
  }
})
