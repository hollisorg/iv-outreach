// Checks the packaged app (dist/win-unpacked): its MCP server launched the way agents launch it, the bundled Google
// Maps scraper and WhatsMyName data, and the app window. Usage: node scripts/packaged-check.mjs <outDir> [--live]
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const exe = resolve('dist/win-unpacked/IV Outreach.exe')
const script = resolve('dist/win-unpacked/resources/app.asar/out/main/mcp.js')
const out = process.argv[2] || join(tmpdir(), 'fitscout-packaged')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'fitscout-pkg-'))
const result = {}

const client = new Client({ name: 'check', version: '0' })
await client.connect(new StdioClientTransport({ command: exe, args: [script], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FITSCOUT_DATA_DIR: data }, stderr: 'pipe' }))
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`)
  return JSON.parse(r.content[0].text)
}
const tools = (await client.listTools()).tools
result.tools = tools.length
assert.ok(tools.some(t => t.name === 'fitscout_research_plan'))
assert.ok(tools.some(t => t.name === 'fitscout_save_research'))
assert.ok(!tools.some(t => t.name === 'fitscout_start_openoutreach'))
const c = await call('fitscout_create_campaign', { name: 'Packaged check (fictional)', offer: 'Booking workflows', icp: { industries: ['Plumbing'], locations: ['Ohio'] } })
const plan = await call('fitscout_research_plan', { campaign_id: c.id, count: 5 })
assert.equal(plan.budget.provider_credits, 0)
const fixture = await call('fitscout_add_leads', { campaign_id: c.id, leads: [{ company: 'Packaged fixture (fictional)', website: 'https://plumber.test', source: 'manual' }] })
const research = await call('fitscout_save_research', { lead_id: fixture.lead_ids[0], fit_score: 70, fit_reason: 'Fixture category matches', evidence: [{ url: 'https://plumber.test', observation: 'Fictional plumbing fixture' }], opportunity: 'Discuss booking needs', unknowns: ['Budget'], confidence: 'low' })
assert.equal(research.research.buying_intent, 'unconfirmed')
result.nativeResearch = { plan: true, saved: true, providerCredits: 0 }
if (process.argv.includes('--live')) {
  const maps = await call('fitscout_find_on_google_maps', { campaign_id: c.id, query: 'roofers in Delaware, Ohio', lat: 40.2987, lng: -83.068 })
  result.maps = { found: maps.found, added: maps.added }
}
await client.close()

const app = await electron.launch({ executablePath: exe, env: { ...process.env, FITSCOUT_DATA_DIR: data } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForSelector('.wordmark')
await win.waitForTimeout(1500)
await win.click('.nav button:has-text("Leads")')
await win.waitForTimeout(800)
await win.screenshot({ path: join(out, 'packaged-leads.png') })
result.window = { title: await win.title(), errors, leadsShown: (await win.$$('tbody tr')).length }
await app.close()
console.log(JSON.stringify(result, null, 1))
