// Desktop setup and optional real-agent read-only status check. Fictional data only; no discovery/provider spending.
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as core from '../src/core/index.js'

const data = resolve('.runtime/managed-test')
const out = resolve('docs/verification/iv-outreach-runtime')
mkdirSync(out, { recursive: true })
const db = core.openDb(join(data, 'fitscout.db'))
const campaigns = core.listCampaigns(db)
if (!campaigns.length) core.createCampaign(db, { name: 'Fictional outreach check', offer: 'Fictional service', icp: { industries: ['Plumbing'] } })
const packaged = process.argv.includes('--packaged')
const app = await electron.launch({ ...(packaged ? { executablePath: resolve('dist/win-unpacked/IV Outreach.exe') } : { args: ['.'], cwd: process.cwd() }), env: { ...process.env, FITSCOUT_DATA_DIR: data } })
try {
  const win = await app.firstWindow()
  await win.setViewportSize({ width: 1440, height: 900 })
  const errors = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = win.getByRole('region', { name: 'OpenOutreach engine setup' })
  // section aria-label maps to a region; test real input/save handlers with fake values, never run a search.
  await panel.getByLabel('BetterContact API key', { exact: false }).fill('PRIVATE_BC_TEST_ONLY')
  await panel.getByLabel('Model-provider API key', { exact: false }).fill('PRIVATE_LLM_TEST_ONLY')
  await panel.getByLabel('Provider and model').fill('anthropic:claude-sonnet-4-5-20250929')
  await panel.getByRole('button', { name: 'Save connection', exact: true }).click()
  await panel.getByText(/Ready. Ask the chat/).waitFor()
  const settings = readFileSync(join(data, 'app-settings.json'), 'utf8')
  assert.ok(!settings.includes('PRIVATE_BC_TEST_ONLY'))
  assert.ok(!settings.includes('PRIVATE_LLM_TEST_ONLY'))
  const exposed = await win.evaluate(() => window.fitscout.call('appSettings'))
  assert.equal(exposed.openOutreach, undefined)
  const status = await win.evaluate(() => window.fitscout.call('openOutreachSetup'))
  assert.equal(status.ready, true)
  await panel.getByRole('button', { name: 'Remove saved keys' }).click()
  await panel.getByText(/Still needed: BetterContact API key/).waitFor()
  await panel.scrollIntoViewIfNeeded()
  await win.screenshot({ path: join(out, packaged ? 'packaged-setup.png' : 'setup.png') })
  let chat = null
  if (process.argv.includes('--chat')) {
    await win.locator('.composer textarea').fill('Only call fitscout_openoutreach_status and tell me what setup is still needed. Do not start any search, browse, change settings, or send anything.')
    await win.locator('.send').click()
    await win.waitForSelector('.send.stop', { timeout: 15000 })
    await win.waitForSelector('.send:not(.stop)', { timeout: 180000 })
    chat = await win.evaluate(() => window.fitscout.call('chatStatus'))
    const steps = await win.locator('.chat-step').allTextContents()
    assert.ok(steps.some((s) => /OpenOutreach/i.test(s)), `Agent did not check OpenOutreach: ${steps.join(', ')}`)
    await win.screenshot({ path: join(out, 'chat-setup-check.png') })
    chat = { checked_openoutreach: true, reply: await win.locator('.bubble.agent .chat-text').last().textContent() }
  }
  assert.equal(core.listMessages(db, {}).length, 0)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ packaged, encrypted_keys: true, keys_removed: true, installed: status.installed, no_messages: true, errors, chat }, null, 2))
} finally { await app.close(); db.close() }
assert.equal(existsSync(join(data, 'openoutreach-bridge.json')), false, 'bridge capability removed when app closes')
