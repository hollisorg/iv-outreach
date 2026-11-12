// A brand-new install (empty database): screenshots the welcome screen. Usage: node scripts/ui-empty.mjs <outDir>
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2] || join(tmpdir(), 'fitscout-shots')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'fitscout-empty-'))
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, FITSCOUT_DATA_DIR: data } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForSelector('.hero')
await win.waitForTimeout(1200)
await win.screenshot({ path: join(out, '0-welcome.png') })
await win.click('.nav button:has-text("Leads")')
await win.waitForTimeout(400)
await win.screenshot({ path: join(out, '0-leads-empty.png') })
console.log(JSON.stringify({ errors }))
await app.close()