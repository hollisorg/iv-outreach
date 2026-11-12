import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from '../src/core/index.js'
import { toCsv } from '../src/core/csv.js'
import { OPENOUTREACH_COLUMNS } from '../src/core/openoutreach.js'

function setup() {
  const db = fs.openDb(':memory:')
  const campaign = fs.createCampaign(db, { name: 'Fictional import', offer: 'Demo', icp: {} })
  const file = join(mkdtempSync(join(tmpdir(), 'fitscout-openoutreach-')), 'leads.csv')
  return { db, campaign, file }
}
const lead = { lead_id: 'source-1', first_name: 'Ann', last_name: 'Demo', company: 'Fictional Co', title: 'Owner', website: 'fictional.test', linkedin_url: 'https://www.linkedin.com/in/ann-demo', email: '', reason: 'Owner, with "local" reach.\nFits the area.', qualified_at: '2026-11-12T12:00:00Z' }
const write = (file, rows) => writeFileSync(file, toCsv(rows, OPENOUTREACH_COLUMNS))

test('OpenOutreach export preserves quoted explanations and source IDs without inventing a fit score', () => {
  const { db, campaign: c, file } = setup()
  write(file, [lead])
  const preview = fs.previewOpenOutreachCsv(file)
  assert.equal(preview.rows, 1)
  assert.equal(preview.sample[0].reason, lead.reason)
  assert.equal(fs.listLeads(db).length, 0, 'preview has no writes')
  const r = fs.importOpenOutreachCsv(db, c.id, file)
  const got = fs.getLead(db, r.added[0])
  assert.equal(got.name, 'Ann Demo')
  assert.equal(got.source, 'openoutreach')
  assert.equal(got.linkedin_url, lead.linkedin_url)
  assert.equal(got.sources[0].reason, lead.reason)
  assert.equal(got.sources[0].external_id, lead.lead_id)
  assert.equal(got.fit_score, null)
  assert.equal(got.messages.length, 0)
  assert.equal(fs.importOpenOutreachCsv(db, c.id, file).updated, 0, 'identical imports do not change provenance')
  assert.equal(fs.listLeads(db).length, 1)
  db.close()
})

test('generic CSV import detects OpenOutreach and reads UTF-16 PowerShell redirects', () => {
  const { db, campaign: c, file } = setup()
  writeFileSync(file, Buffer.from('\uFEFF' + toCsv([{ ...lead, first_name: 'Zoë' }], OPENOUTREACH_COLUMNS), 'utf16le'))
  const r = fs.importCsv(db, c.id, file)
  assert.equal(r.source, 'openoutreach')
  assert.equal(fs.getLead(db, r.added[0]).name, 'Zoë Demo')
  assert.equal(fs.importCsv(db, c.id, file).duplicates, 1)
  db.close()
})

test('repeat source ID dedupes a contact with no email or profile and fills later details', () => {
  const { db, campaign: c, file } = setup()
  write(file, [{ ...lead, linkedin_url: '' }])
  const [id] = fs.importOpenOutreachCsv(db, c.id, file).added
  fs.updateLead(db, id, { notes: 'Keep my note', name: 'My corrected name', status: 'replied' })
  fs.setFitScores(db, [{ lead_id: id, fit_score: 62, reason: 'My judgement' }])
  write(file, [{ ...lead, email: 'ann@fictional.test', reason: 'Updated qualification' }])
  const r = fs.importOpenOutreachCsv(db, c.id, file)
  assert.equal(r.added.length, 0)
  assert.equal(r.updated, 1)
  const got = fs.getLead(db, id)
  assert.equal(got.name, 'My corrected name')
  assert.equal(got.notes, 'Keep my note')
  assert.equal(got.status, 'replied')
  assert.equal(got.fit_score, 62)
  assert.equal(got.fit_reason, 'My judgement')
  assert.equal(got.email, 'ann@fictional.test')
  assert.equal(got.sources[0].reason, 'Updated qualification')
  db.close()
})

test('existing leads are matched by normalized profile and never have bounced addresses reset', () => {
  const { db, campaign: c, file } = setup()
  const [id] = fs.addLeads(db, c.id, [{ ...lead, name: 'Ann Demo', source: 'manual', email: 'ann@fictional.test' }]).added
  db.prepare("update leads set email_status = 'bounced' where id = ?").run(id)
  write(file, [{ ...lead, linkedin_url: 'http://linkedin.com/in/Ann-Demo/?trk=example', email: 'ann@fictional.test' }])
  const r = fs.importOpenOutreachCsv(db, c.id, file)
  assert.equal(r.added.length, 0)
  assert.equal(r.duplicates, 1)
  const got = fs.getLead(db, id)
  assert.equal(got.email_status, 'bounced')
  assert.equal(got.source, 'manual')
  assert.equal(got.sources.length, 1)
  db.close()
})

test('imports respect suppression and cancel pending drafts when a new address is blocked', () => {
  const { db, campaign: c, file } = setup()
  write(file, [lead])
  const [id] = fs.importOpenOutreachCsv(db, c.id, file).added
  fs.saveDrafts(db, [{ lead_id: id, channel: 'linkedin', body: 'Fictional draft.' }])
  fs.suppress(db, { kind: 'email', value: 'ann@fictional.test', reason: 'Test opt-out' })
  write(file, [{ ...lead, email: 'ann@fictional.test' }])
  const r = fs.importOpenOutreachCsv(db, c.id, file)
  assert.equal(r.suppressed, 1)
  assert.equal(fs.getLead(db, id).status, 'suppressed')
  assert.equal(fs.getLead(db, id).messages[0].status, 'cancelled')
  const second = fs.createCampaign(db, { name: 'Other', icp: {} })
  const again = fs.importOpenOutreachCsv(db, second.id, file)
  assert.equal(again.suppressed, 1)
  assert.equal(fs.getLead(db, again.added[0]).status, 'suppressed')
  db.close()
})

test('conflicting email/profile identities are skipped without merging people', () => {
  const { db, campaign: c, file } = setup()
  const [other] = fs.addLeads(db, c.id, [{ name: 'Different Person', email: 'other@fictional.test' }]).added
  write(file, [lead])
  const [id] = fs.importOpenOutreachCsv(db, c.id, file).added
  write(file, [{ ...lead, email: 'other@fictional.test' }])
  const r = fs.importOpenOutreachCsv(db, c.id, file)
  assert.equal(r.conflicts, 1)
  assert.equal(fs.getLead(db, id).email, null)
  assert.equal(fs.getLead(db, other).sources.length, 0)
  assert.equal(fs.listLeads(db).length, 2)
  db.close()
})

test('malformed exports fail before importing and a core failure rolls the entire batch back', () => {
  const { db, campaign: c, file } = setup()
  write(file, [lead, { ...lead, lead_id: '' }])
  assert.throws(() => fs.importOpenOutreachCsv(db, c.id, file), /lead_id/)
  assert.equal(fs.listLeads(db).length, 0)
  writeFileSync(file, OPENOUTREACH_COLUMNS.join(',') + '\n"unfinished')
  assert.throws(() => fs.importOpenOutreachCsv(db, c.id, file), /quoted/)
  writeFileSync(file, 'email,name\na@b.test,Demo')
  assert.throws(() => fs.importOpenOutreachCsv(db, c.id, file), /not an OpenOutreach/)
  write(file, [lead, { ...lead, lead_id: 'source-2', linkedin_url: 'https://linkedin.com/in/%ZZ' }])
  assert.throws(() => fs.importOpenOutreachCsv(db, c.id, file))
  assert.equal(fs.listLeads(db).length, 0)
  assert.equal(db.prepare('select count(*) n from lead_sources').get().n, 0)
  db.close()
})
