// Isolated UI data; real private Stripe TEST balance. No supplier calls.
import {_electron as electron} from 'playwright'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
const out=resolve('docs/verification/iv-premium-local');mkdirSync(out,{recursive:true})
const data=mkdtempSync(join(tmpdir(),'iv-local-ui-'));process.env.FITSCOUT_DATA_DIR=data
const db=core.openDb();core.createCampaign(db,{name:'Fictional discovery test',offer:'AI-designed services',icp:{industries:['Home services']}});db.close()
const built=process.argv.includes('--built')
const app=await electron.launch({...built?{args:['.'],cwd:process.cwd()}:{executablePath:resolve('dist/win-unpacked/IV Outreach.exe')},env:{...process.env,FITSCOUT_DATA_DIR:data,IV_PREMIUM_API_URL:'http://127.0.0.1:4319'}})
const win=await app.firstWindow(),errors=[];win.on('pageerror',e=>errors.push(String(e)))
try{
 await win.setViewportSize({width:1440,height:1000});await win.waitForSelector('.wordmark');await win.emulateMedia({reducedMotion:'reduce'})
 await win.click('.nav button:has-text("Scanning")');await win.screenshot({path:join(out,'scan-gallery.png')})
 await win.getByRole('button',{name:'Local markets',exact:true}).click();await win.getByLabel('Scan location').fill('Columbus, Ohio')
 await win.getByLabel('Add business type').selectOption('cleaning');await win.getByLabel('Add business type').selectOption('water_treatment')
 assert.equal(await win.getByLabel('Add business type').isDisabled(),true)
 await win.getByRole('button',{name:'20 Broader',exact:true}).click();await win.getByText('Up to 60 listings',{exact:true}).waitFor()
 await win.getByRole('button',{name:'Remove Water treatment companies',exact:true}).click();assert.equal(await win.getByLabel('Add business type').isEnabled(),true)
 await win.getByRole('button',{name:'10 Balanced',exact:true}).click()
 assert.equal(await win.locator('input[type="checkbox"]').count(),0)
 await win.screenshot({path:join(out,'scanning.png')})
 const styles=await win.getByRole('button',{name:'Scan businesses',exact:true}).evaluate(el=>{const s=getComputedStyle(el);return {foreground:s.color,background:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight}})
 assert.equal(styles.foreground,'rgb(255, 255, 255)')
 await win.getByRole('button',{name:'Save this search',exact:true}).click();await win.getByText('Saved searches (1)',{exact:true}).waitFor()
 await win.getByRole('button',{name:'Remove Cleaning companies',exact:true}).click();await win.getByText('Saved searches (1)',{exact:true}).click();await win.getByRole('button',{name:'Load',exact:true}).click();await win.getByRole('button',{name:'Remove Cleaning companies',exact:true}).waitFor()
 await win.getByRole('button',{name:/All scans/}).click();await win.getByRole('button',{name:'Custom search',exact:true}).click();await win.getByText('Follow a specific lead.',{exact:true}).waitFor()
 await win.setViewportSize({width:1200,height:850});await win.getByRole('button',{name:/All scans/}).click();await win.screenshot({path:join(out,'gallery-1200.png')});await win.getByRole('button',{name:'Local markets',exact:true}).click();await win.screenshot({path:join(out,'scanning-1200.png')})
 assert.equal(await win.locator('.scan-workspace').evaluate(el=>getComputedStyle(el).animationName),'none')
 await win.setViewportSize({width:1440,height:1000});await win.click('.nav button:has-text("Settings")')
 const premium=win.getByRole('region',{name:'IV Outreach Premium'});await premium.getByRole('button',{name:'Connect this PC',exact:true}).click();await premium.locator('.premium-balance').waitFor()
 await premium.scrollIntoViewIfNeeded();await win.screenshot({path:join(out,'local-premium.png')})
 const s=await win.evaluate(()=>window.fitscout.call('premiumStatus'));assert.equal(s.auth_mode,'local_test');assert.equal(s.test_mode,true);assert.equal(s.premium,true);assert.equal(s.available,600)
 assert.equal(await win.evaluate(()=>window.fitscout.call('appSettings').then(s=>'premiumSessionEnc' in s)),false)
 assert.deepEqual(errors,[])
 const result={passed:true,packaged:!built,localTest:true,available:s.available,providers:s.capabilities.map(c=>({id:c.id,available:c.available})),styles,reducedMotion:true,categoryLimit:true,savedSelectionRestored:true,noCheckboxes:true,errors};writeFileSync(join(out,'ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await app.close()}
