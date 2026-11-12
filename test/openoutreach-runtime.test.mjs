import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenOutreachRuntime, OPENOUTREACH_VERSION, runtimeEnv, validateSearch, startOpenOutreachBridge, callOpenOutreachBridge } from '../src/service/openoutreach.js'
import * as core from '../src/core/index.js'

function fixture(options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'iv-outreach-run-'))
  const db = core.openDb(join(dataDir, 'fitscout.db'))
  const campaign = core.createCampaign(db, { name: 'Fictional plumbing', offer: 'Demo offer', icp: { industries: ['Plumbing'] } })
  const launches = []
  const config = { model: 'anthropic:test-model', llmKey: 'PRIVATE_LLM_TEST', betterContactKey: 'PRIVATE_BC_TEST' }
  const opts = { dataDir, vendorDir: 'unused', getDb: () => db, getConfig: () => config, pythonPath: process.execPath,
    spawnProcess: (exe, args, opts) => {
      const child = new EventEmitter()
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null
      launches.push({ exe, args, opts, child })
      return child
    }, ...options }
  const runtime = new OpenOutreachRuntime(opts)
  mkdirSync(runtime.root, { recursive: true })
  writeFileSync(join(runtime.root, 'installed.json'), JSON.stringify({ version: OPENOUTREACH_VERSION }))
  return { dataDir, db, campaign, launches, runtime, opts }
}
const row = { lead_id: 17, full_name: 'Ann Fictional', company: 'Fictional Plumbing', title: 'Owner', website: 'fictional.test', email: 'ann@fictional.test', reason: 'Owner in sample market', qualified_at: '2026-11-12' }
const start = (f, extra = {}) => f.runtime.start({ campaign_id: f.campaign.id, count: 3, request_id: 'unique-request-01', ...extra })
const finish = (child, code = 0) => { child.exitCode = code; child.emit('close', code) }

test('runtime only constructs bounded discovery commands, isolates credentials and imports streamed leads', () => {
  const f = fixture()
  const job = start(f)
  const call = f.launches[0]
  assert.equal(call.opts.shell, false)
  assert.ok(call.args.includes('find'))
  assert.ok(!call.args.includes('emails'))
  assert.ok(!call.args.some((x) => /PRIVATE/.test(x)))
  assert.equal(call.opts.env.OPENOUTFIND_LLM_API_KEY, 'PRIVATE_LLM_TEST')
  assert.equal(call.opts.env.OPENOUTFIND_CONTACTS_API_TOKEN, undefined)
  const line = JSON.stringify(row) + '\n'
  call.child.stdout.write(line.slice(0, 12)); call.child.stdout.write(line.slice(12))
  finish(call.child)
  assert.equal(f.runtime.job(job.id).status, 'completed')
  assert.equal(f.runtime.job(job.id).imported, 1)
  const lead = core.listLeads(f.db)[0]
  assert.equal(lead.name, 'Ann Fictional', 'free provider discovery can return only full_name')
  assert.equal(core.getLead(f.db, lead.id).sources[0].reason, row.reason)
  assert.equal(core.listMessages(f.db, {}).length, 0)
  assert.ok(!JSON.stringify(f.runtime.status()).includes('PRIVATE'))
  assert.ok(!readFileSync(join(f.runtime.root, 'jobs.json'), 'utf8').includes('PRIVATE'))
  f.runtime.close(); f.db.close()
})

test('retries are idempotent across process restarts and cannot spend twice', () => {
  const f = fixture()
  const j = start(f, { emails: true })
  assert.ok(f.launches[0].args.includes('emails'))
  assert.equal(start(f, { emails: true }).id, j.id)
  assert.equal(f.launches.length, 1)
  assert.throws(() => start(f, { count: 4 }), /different search/)
  assert.throws(() => start(f, { request_id: 'another-request' }), /already running/)
  f.runtime.close()
  const restarted = new OpenOutreachRuntime(f.opts)
  assert.equal(restarted.start({ campaign_id: f.campaign.id, count: 3, emails: true, request_id: 'unique-request-01' }).status, 'interrupted')
  assert.equal(f.launches.length, 1)
  restarted.close(); f.db.close()
})

test('partial failures retain leads and never expose raw diagnostic keys', () => {
  const f = fixture()
  const j = start(f)
  f.launches[0].child.stdout.write(JSON.stringify(row) + '\n')
  f.launches[0].child.stderr.write(JSON.stringify({ error: { type: 'no_credits', message: 'PRIVATE_LLM_TEST PRIVATE_BC_TEST' } }) + '\n')
  finish(f.launches[0].child, 1)
  const result = f.runtime.job(j.id)
  assert.equal(result.status, 'partial')
  assert.match(result.message, /no_credits/)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/)
  assert.equal(result.imported, 1)
  f.runtime.close(); f.db.close()
})

test('cancellation and timeout terminate jobs without retrying or dropping imported leads', async () => {
  const f = fixture({ timeoutMs: 40 })
  const j = start(f)
  f.launches[0].child.stdout.write(JSON.stringify(row) + '\n')
  f.runtime.cancel(j.id)
  finish(f.launches[0].child, 1)
  assert.equal(f.runtime.job(j.id).status, 'cancelled')
  const next = start(f, { request_id: 'timeout-request-02' })
  await new Promise((r) => setTimeout(r, 65))
  finish(f.launches[1].child, 1)
  assert.equal(f.runtime.job(next.id).status, 'timed_out')
  assert.equal(f.launches.length, 2)
  assert.equal(core.listLeads(f.db).length, 1)
  f.runtime.close(); f.db.close()
})

test('runtime validation rejects command injection, empty setup and invalid campaigns before launching', () => {
  for (const count of [0, 26, 2.5, '3; send']) assert.throws(() => validateSearch({ campaign_id: 'c', count, request_id: 'valid-request' }))
  assert.throws(() => validateSearch({ campaign_id: 'c', count: 1, request_id: 'x;send' }))
  const f = fixture({ getConfig: () => ({}) })
  assert.throws(() => start(f), /Settings/)
  assert.equal(f.launches.length, 0)
  const env = runtimeEnv({}, { icp: {} }, 'cache', { PATH: 'safe', OPENAI_API_KEY: 'private', PYTHONPATH: 'injection', OUTSEND_MAILBOX_PASSWORD: 'private' })
  assert.equal(env.PYTHONPATH, undefined)
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.OUTSEND_MAILBOX_PASSWORD, undefined)
  f.runtime.close(); f.db.close()
})

test('archived v0.2 bridge authenticates local clients without exposing provider keys', async () => {
  const f = fixture()
  const bridge = await startOpenOutreachBridge(f.runtime, f.dataDir)
  const saved = JSON.parse(readFileSync(join(f.dataDir, 'openoutreach-bridge.json'), 'utf8'))
  const denied = await fetch(`${saved.url}/find`, { method: 'POST', body: '{}' })
  assert.equal(denied.status, 403)
  const originDenied = await fetch(`${saved.url}/status`, { method: 'POST', headers: { Authorization: `Bearer ${saved.token}`, Origin: 'https://example.test' } })
  assert.equal(originDenied.status, 403)
  try {
    const job = await callOpenOutreachBridge(f.dataDir, 'find', { campaign_id: f.campaign.id, count: 2, request_id: 'legacy-discovery-01' })
    f.launches[0].child.stdout.write(JSON.stringify(row) + '\n'); finish(f.launches[0].child)
    const done = await callOpenOutreachBridge(f.dataDir, 'job', { job_id: job.id })
    assert.equal(done.imported, 1)
    const status = await callOpenOutreachBridge(f.dataDir, 'status')
    assert.ok(!JSON.stringify(status).includes('PRIVATE'))
  } finally { bridge.close(); f.runtime.close(); f.db.close() }
})
