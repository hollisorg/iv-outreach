// Checks the packaged app: its MCP server launched the way agents launch it, the bundled Google Maps scraper and
// WhatsMyName data, and the app window (every page in the sidebar, no page errors).
// Usage: node scripts/packaged-check.mjs <outDir> [--live] [--app=<exe>]
//   --app: the app's program (default dist/win-unpacked/IV Outreach.exe; on a Mac, IV Outreach.app/Contents/MacOS/IV Outreach)
//   --live: also a real Google Maps search through the bundled scraper
// Exits 1 when a check fails.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import assert from 'node:assert/strict'

const appArg = process.argv.find((a) => a.startsWith('--app='))?.slice(6)
const exe = resolve(appArg || 'dist/win-unpacked/IV Outreach.exe')
// a Mac app bundle keeps its resources in Contents/Resources, beside Contents/MacOS
const resources = /\.app[\\/]Contents[\\/]MacOS[\\/][^\\/]+$/.test(exe) ? join(dirname(exe), '..', 'Resources') : join(dirname(exe), 'resources')
const script = join(resources, 'app.asar', 'out', 'main', 'mcp.js')
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(tmpdir(), 'fitscout-packaged')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'fitscout-pkg-'))
const result = {}

// the bundled scraper for this platform runs (it prints its options)
const scraper = join(resources, 'vendor', 'gmaps', process.platform === 'win32' ? 'google_maps_scraper.exe' : 'google_maps_scraper')
assert.ok(existsSync(scraper), `no bundled Maps scraper at ${scraper}`)
const help = spawnSync(scraper, ['-h'], { encoding: 'utf8', timeout: 60000, windowsHide: true })
assert.match(`${help.stdout}${help.stderr}`, /-results/, `the bundled Maps scraper didn't run: ${help.error?.message || help.stderr}`)
assert.ok(existsSync(join(resources, 'vendor', 'wmn', 'wmn-data.json')), 'no bundled WhatsMyName data')
result.scraper = 'runs'

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
const pages = []
const navs = win.locator('nav.side .nav button')
for (let i = 0; i < await navs.count(); i++) {
  const b = navs.nth(i)
  const label = (await b.innerText()).trim().replace(/\s+/g, ' ')
  await b.click()
  await win.waitForTimeout(700)
  pages.push(label)
  await win.screenshot({ path: join(out, `packaged-${i + 1}.png`) })
}
await win.locator('nav.side .nav button', { hasText: 'Leads' }).first().click()
await win.waitForTimeout(800)
result.window = { title: await win.title(), version: await app.evaluate(({ app: a }) => a.getVersion()), pages, errors, leadsShown: (await win.$$('tbody tr')).length }
await app.close()
console.log(JSON.stringify(result, null, 1))
if (errors.length || pages.length < 5 || !result.window.leadsShown) { console.log('FAIL'); process.exit(1) }
console.log('PASS')
