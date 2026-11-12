// Launches the built app against a throwaway database of clearly fictional demo data and screenshots each page.
// Usage: npm run build && node scripts/ui-check.mjs <outDir>
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from '../src/core/index.js'

const out = process.argv[2] || join(tmpdir(), 'fitscout-shots')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'fitscout-ui-'))
process.env.FITSCOUT_DATA_DIR = data

const db = fs.openDb()
fs.saveSender(db, { name: 'Sam Demo', title: 'Owner', company: 'Demo Co (fictional)', postal_address: '100 Example Ave, Testville, ZZ 00000', reply_email: 'sam@demo.test' })
const c = fs.createCampaign(db, { name: 'Plumbing owners, Columbus (demo)', offer: 'Fictional demo offer', icp: { industries: ['Plumbing'], titles: ['Owner'], locations: ['Columbus, OH'] } })
const { added } = fs.addLeads(db, c.id, [
  { name: 'Ann Able', title: 'Owner', company: 'Able Plumbing (demo)', email: 'ann@able.test', location: 'Columbus, OH', source: 'claude_research', website: 'able.test' },
  { name: 'Ben Brook', title: 'Owner', company: 'Brook Drains (demo)', email: 'ben@brook.test', linkedin_url: 'https://www.linkedin.com/in/demo-ben', location: 'Dublin, OH', source: 'claude_research' },
  { name: 'Cara Cole', title: 'Founder', company: 'Cole Pipe Co (demo)', linkedin_url: 'https://www.linkedin.com/in/demo-cara', location: 'Westerville, OH', source: 'csv' },
  { company: 'Delta Rooter (demo)', email: 'info@delta.test', location: 'Hilliard, OH', source: 'claude_research' },
  { name: 'Eli East', title: 'Owner', company: 'East Side Plumbing (demo)', email: 'eli@east.test', location: 'Columbus, OH', source: 'claude_research' },
])
fs.setFitScores(db, added.map((id, i) => ({ lead_id: id, fit_score: [92, 81, 74, 66, 58][i], reason: 'Demo reason: owner-operated, 5-20 techs, service area matches.' })))
const drafts = fs.saveDrafts(db, [
  { lead_id: added[0], channel: 'email', subject: 'Your new Dublin service area', body: 'Hi Ann,\n\nSaw Able just started covering Dublin. Demo text only: this is a fictional draft for a UI check.\n\nWorth a 10-minute call next week?' },
  { lead_id: added[1], channel: 'email', subject: 'Quick idea for Brook Drains', body: 'Hi Ben, demo draft. We guarantee results.' },
  { lead_id: added[2], channel: 'linkedin', body: 'Hi Cara, noticed Cole Pipe is hiring two techs. Demo note for a UI check. Open to connecting?' },
  { lead_id: added[4], channel: 'email', subject: 'Hi', body: 'Hi {{first_name}}, demo.' },
])
// one already contacted and replied, one LinkedIn note approved and waiting
const [sent] = fs.saveDrafts(db, [{ lead_id: added[3], channel: 'email', subject: 'Demo', body: 'Demo sent message.' }])
fs.approveMessages(db, [sent.message_id, drafts[2].message_id])
fs.markSent(db, sent.message_id, { at: new Date(Date.now() - 3 * 3600e3).toISOString() })
fs.logReply(db, { lead_id: added[3], received_at: new Date(Date.now() - 2.5 * 3600e3).toISOString(), intent: 'interested', sentiment: 'positive', text: 'Sure, call me Thursday. (demo)' })

const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, FITSCOUT_DATA_DIR: data } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForSelector('.wordmark')
await win.waitForTimeout(800)
const shot = async (name) => {
  await win.waitForTimeout(500)
  await win.screenshot({ path: join(out, `${name}.png`) })
}
await shot('1-today')
for (const [label, name] of [['Leads', '2-leads'], ['Approve', '3-approve'], ['LinkedIn', '4-linkedin'], ['Settings', '5-settings']]) {
  await win.click(`.nav button:has-text("${label}")`)
  await shot(name)
}
await win.click('.nav button:has-text("Leads")')
await win.click('tr:has-text("Delta Rooter")')
await shot('6-lead-drawer')
await win.keyboard.press('Escape')
await win.click('.nav button:has-text("Today")')
await shot('7-today-fixed')

// --chat: one real turn on the person's own Claude Code, answering the Allow card by clicking it
let chatResult = null
if (process.argv.includes('--chat')) {
  await win.fill('.composer textarea', `Approve the draft to Ann Able (message id ${drafts[0].message_id}) with fitscout_approve_messages, then tell me in one sentence what happened.`)
  await win.click('.send')
  await win.waitForSelector('.chat-ask:not(.answered)', { timeout: 180000 })
  await shot('8-allow-card')
  await win.click('.chat-ask:not(.answered) button:has-text("Allow")')
  await win.waitForSelector('.send:not(.stop)', { timeout: 180000 })
  await win.waitForTimeout(1000)
  await shot('9-chat-done')
  const status = fs.listMessages(db, {}).find((m) => m.id === drafts[0].message_id).status
  chatResult = { message_status: status, steps: await win.$$eval('.chat-step', (els) => els.map((e) => e.textContent.trim())), reply: (await win.$$eval('.bubble.agent .chat-text', (els) => els.map((e) => e.textContent.trim()))).pop() }
}
const text = await win.textContent('body')
console.log(JSON.stringify({ out, errors, sawChatAgent: /Claude Code|Codex|Hermes/.test(text), sawDemoLead: text.includes('Delta Rooter'), chatResult }, null, 1))
await app.close()
