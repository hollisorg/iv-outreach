// Real built Electron UI, isolated fictional data. Intercept the research event so no external search runs.
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
const out = resolve('docs/verification/iv-native')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'iv-native-ui-'))
process.env.FITSCOUT_DATA_DIR = data
const db = core.openDb()
const campaign = core.createCampaign(db, { name: 'Fictional research demo', offer: 'AI-assisted booking websites', icp: { industries: ['Plumbers'], locations: ['Ohio'] } })
const { added } = core.addLeads(db, campaign.id, [{ company: 'Fictional Plumbing', website: 'https://plumber.test', source: 'claude_research' }])
core.saveResearch(db, { lead_id: added[0], fit_score: 75, fit_reason: 'Fictional fit reason', evidence: [{ url: 'https://plumber.test/services', observation: 'Fictional fixture: offers plumbing services.' }], opportunity: 'Explore whether a booking workflow would help.', unknowns: ['Current systems and budget'], confidence: 'medium' })
db.close()
const packaged = process.argv.includes('--packaged')
const app = await electron.launch({ ...(packaged ? { executablePath: resolve('dist/win-unpacked/IV Outreach.exe') } : { args: ['.'], cwd: process.cwd() }), env: { ...process.env, FITSCOUT_DATA_DIR: data } })
const errors = []
const win = await app.firstWindow()
win.on('pageerror', e => errors.push(String(e)))
try {
  await win.setViewportSize({ width: 1440, height: 960 })
  await win.waitForSelector('.wordmark')
  // Observe fs:ask at the UI boundary and prevent it reaching chat. The live harness tests cover execution.
  await win.evaluate(() => {
    window.nativeRequests = []
    window.addEventListener('fs:ask', e => { window.nativeRequests.push(e.detail); e.stopImmediatePropagation() }, true)
  })
  await win.click('.nav button:has-text("Scanning")')
  await win.getByRole('button', { name: 'Agent research', exact:true }).click()
  await win.getByRole('button', { name: 'Research with my agent', exact: true }).waitFor({ state: 'visible' })
  await win.getByLabel('New prospects').selectOption('10')
  await win.getByLabel('Research depth').selectOption('deep')
  await win.waitForFunction(() => !document.querySelector('.discovery-panel button').disabled)
  await win.screenshot({ path: join(out, `${packaged ? 'packaged-' : ''}discovery.png`) })
  await win.getByRole('button', { name: 'Close the chat', exact: true }).click()
  await win.getByRole('button', { name: 'Research with my agent', exact: true }).click()
  assert.equal(await win.locator('aside.chat').count(), 1)
  const requests = await win.evaluate(() => window.nativeRequests)
  assert.equal(requests.length, 1)
  assert.match(requests[0].text, /Research 10 new prospects.*deep research/)
  assert.match(requests[0].text, /Do not draft, approve or send/)
  await win.click('.nav button:has-text("Leads")')
  await win.locator('tbody tr').first().click()
  await win.getByText('Fictional fixture: offers plumbing services.', { exact: true }).waitFor()
  assert.match(await win.locator('.drawer').innerText(), /unconfirmed/i)
  await win.screenshot({ path: join(out, `${packaged ? 'packaged-' : ''}evidence.png`) })
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  await win.click('.nav button:has-text("Settings")')
  await win.getByText('Research, built in', { exact: true }).scrollIntoViewIfNeeded()
  assert.doesNotMatch(await win.locator('main').innerText(), /OpenOutreach|BetterContact/)
  await win.screenshot({ path: join(out, `${packaged ? 'packaged-' : ''}settings.png`) })
  assert.deepEqual(errors, [])
  const result = { packaged, passed: true, errors, selectedCount: 10, selectedDepth: 'deep', chatReopened: true, sourceEvidenceShown: true, providerSetupRemoved: true }
  writeFileSync(join(out, `${packaged ? 'packaged-' : ''}ui.json`), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { await app.close() }
