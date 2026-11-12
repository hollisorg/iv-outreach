// Real Electron import flow, using a fictional CSV and a temporary database. No provider calls.
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from '../src/core/index.js'
import { toCsv } from '../src/core/csv.js'
import { OPENOUTREACH_COLUMNS } from '../src/core/openoutreach.js'

const data = mkdtempSync(join(tmpdir(), 'fitscout-oo-ui-'))
const out = resolve(process.argv[2] || 'docs/verification/openoutreach')
mkdirSync(out, { recursive: true })
const db = fs.openDb(join(data, 'fitscout.db'))
const campaign = fs.createCampaign(db, { name: 'Local owners (fictional)', offer: 'Demo', icp: {} })
const csv = join(data, 'leads.csv')
writeFileSync(csv, toCsv([
  { lead_id: 'demo-1', first_name: 'Ann', last_name: 'Demo', company: 'Fictional Plumbing', title: 'Owner', email: 'ann@fictional.test', website: 'fictional.test', reason: 'Owner of a local service business. Matches the sample campaign.', qualified_at: '2026-11-12' },
  { lead_id: 'demo-2', first_name: 'Ben', last_name: 'Example', company: 'Example Heating', title: 'Founder', reason: 'Local founder with a small team. Fictional demonstration only.', qualified_at: '2026-11-12' },
], OPENOUTREACH_COLUMNS))
const packaged = process.argv.includes('--packaged')
const app = await electron.launch({
  ...(packaged ? { executablePath: resolve('dist/win-unpacked/IV Outreach.exe') } : { args: ['.'], cwd: process.cwd() }),
  env: { ...process.env, FITSCOUT_DATA_DIR: data },
})
try {
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (e) => errors.push(String(e)))
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, csv)
  await win.setViewportSize({ width: 1440, height: 900 })
  await win.getByRole('button', { name: 'Leads', exact: true }).click()
  await win.getByRole('button', { name: 'OpenOutreach', exact: true }).click()
  await win.getByRole('button', { name: 'Choose OpenOutreach CSV' }).click()
  await win.getByText('2 rows', { exact: true }).waitFor()
  assert.equal(fs.listLeads(db).length, 0)
  await win.screenshot({ path: join(out, 'import-preview.png') })
  await win.getByRole('button', { name: `Import into ${campaign.name}` }).click()
  await win.locator('tbody tr').filter({ hasText: 'Ann Demo' }).waitFor()
  assert.equal(fs.listLeads(db).length, 2)
  assert.equal(fs.listMessages(db, {}).length, 0)
  // Re-select and re-import the same file through the real IPC/UI route.
  await win.getByRole('button', { name: 'Choose OpenOutreach CSV' }).click()
  await win.getByRole('button', { name: `Import into ${campaign.name}` }).click()
  await win.getByText(/OpenOutreach: 0 new, 2 already here/).waitFor()
  assert.equal(fs.listLeads(db).length, 2)
  await win.locator('tbody tr').filter({ hasText: 'Ann Demo' }).click()
  await win.getByRole('heading', { name: 'OpenOutreach fit explanation' }).waitFor()
  await win.screenshot({ path: join(out, 'lead-provenance.png') })
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  await win.setViewportSize({ width: 1100, height: 800 })
  await win.screenshot({ path: join(out, 'import-compact.png') })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ packaged, rows: 2, duplicate_import: 'passed', preview_no_writes: true, messages: 0, errors, out }))
} finally {
  await app.close()
  db.close()
}
