import assert from 'node:assert/strict'
// Launches the built app against a throwaway database of clearly fictional demo data and screenshots each page.
// Usage: npm run build && node scripts/ui-check.mjs <outDir>
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from '../src/core/index.js'

const out = resolve('docs/verification/iv-pages')
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
  { company: 'Delta Rooter (demo)', email: 'info@delta.test', location: 'Hilliard, OH', source: 'google_maps', phone: '(614) 555-0142' },
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
db.prepare('update leads set rating = 4.7, review_count = 212, category = ? where company = ?').run('Plumber', 'Delta Rooter (demo)')
db.prepare('update leads set socials_json = ? where id = ?').run(JSON.stringify({ instagram: 'https://www.instagram.com/demo.east.plumbing/', found: [{ site: 'TikTok', url: 'https://www.tiktok.com/@eastplumbingdemo', handle: 'eastplumbingdemo', confirmed: false, channel: 'tiktok' }] }), added[4])
const [ig] = fs.saveDrafts(db, [{ lead_id: added[4], channel: 'instagram', body: 'Hi Eli, loved the before-and-after reel on the water heater swap. Demo DM for a UI check.' }])
fs.approveMessages(db, [ig.message_id])
const [sent] = fs.saveDrafts(db, [{ lead_id: added[3], channel: 'email', subject: 'Demo', body: 'Demo sent message.' }])
fs.approveMessages(db, [sent.message_id, drafts[2].message_id])
fs.markSent(db, sent.message_id, { at: new Date(Date.now() - 3 * 3600e3).toISOString() })
fs.logReply(db, { lead_id: added[3], received_at: new Date(Date.now() - 2.5 * 3600e3).toISOString(), intent: 'interested', sentiment: 'positive', text: 'Sure, call me Thursday. (demo)' })

db.close()
const packaged=process.argv.includes('--packaged')
const app=await electron.launch({...(packaged?{executablePath:resolve('dist/win-unpacked/IV Outreach.exe')}:{args:['.'],cwd:process.cwd()}),env:{...process.env,FITSCOUT_DATA_DIR:data}})
const win=await app.firstWindow(),errors=[]
win.on('pageerror',e=>errors.push(String(e)))
const navigate=async name=>{await win.click(`.nav button:has-text("${name}")`);await win.locator('.page-stage').waitFor()}
try{
 await win.waitForSelector('.wordmark')
 for(const width of [1440,1200]){
  await win.setViewportSize({width,height:960})
  for(const page of ['Today','Leads','Approve','Social','Settings']){
   await navigate(page)
   await win.getByRole('button',{name:'Pause background animation',exact:true}).click()
   assert.equal(await win.locator('.page-stage-art').evaluate(el=>getComputedStyle(el).animationPlayState),'paused')
   await win.getByRole('button',{name:'Play background animation',exact:true}).click()
   assert.equal(await win.locator('.page-stage-art').evaluate(el=>getComputedStyle(el).animationPlayState),'running')
   await win.emulateMedia({reducedMotion:'reduce'})
   assert.equal(await win.locator('.page-stage-art').evaluate(el=>getComputedStyle(el).animationName),'none')
   assert.equal(await win.getByRole('button',{name:'Pause background animation',exact:true}).count(),0)
   assert.ok(await win.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${page} overflow at ${width}`)
   await win.screenshot({path:join(out,`${page.toLowerCase()}-${width}.png`)})
   await win.emulateMedia({reducedMotion:'no-preference'})
  }
 }
 // Section shortcuts must move focus as well as scroll, without unmounting unsaved forms.
 await win.getByRole('button',{name:/03 \/ Sender profile Your identity/}).click()
 await win.waitForFunction(()=>document.activeElement?.id==='setup-sender')
 await win.locator('#setup-sender input').first().fill('Unsaved Demo')
 await win.locator('main').evaluate(el=>el.scrollTo({top:0}))
 await win.getByRole('button',{name:/02 \/ Premium & credits Extra reach/}).click()
 await win.waitForFunction(()=>document.activeElement?.id==='setup-premium')
 assert.equal(await win.locator('#setup-sender input').first().inputValue(),'Unsaved Demo')
 await win.waitForFunction(()=>document.querySelector('.page-stage').classList.contains('motion-paused'))
 await navigate('Leads');await win.getByRole('radio',{name:'Best fit',exact:true}).click()
 assert.match(await win.locator('tbody tr').first().innerText(),/Ann Able/)
 await win.locator('tbody tr').first().click();await win.locator('.drawer').waitFor()
 await win.getByRole('button',{name:'Close',exact:true}).click()
 await navigate('Approve')
 const draft=win.locator('.draft').filter({hasText:'Ann Able'})
 await draft.getByLabel('Subject',{exact:true}).fill('An updated fictional draft')
 await draft.getByRole('button',{name:'Save changes',exact:true}).click()
 await draft.getByRole('button',{name:'Approve',exact:true}).waitFor()
 await navigate('Social');assert.equal(await win.getByRole('button',{name:'I sent it',exact:true}).first().isDisabled(),true)
 assert.deepEqual(errors,[])
 const result={passed:true,packaged,widths:[1440,1200],pages:5,motionPause:true,reducedMotion:true,offscreenPause:true,settingsFocus:true,unsavedFormPreserved:true,sortAndDrawer:true,draftSave:true,socialSendGuard:true,errors}
 writeFileSync(join(out,'ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await app.close()}
