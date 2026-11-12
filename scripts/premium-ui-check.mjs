import {_electron as electron} from 'playwright'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
import {premiumFixture} from './premium-fixture.mjs'
const out=resolve('docs/verification/iv-premium');mkdirSync(out,{recursive:true})
const data=mkdtempSync(join(tmpdir(),'iv-premium-ui-'));process.env.FITSCOUT_DATA_DIR=data
const db=core.openDb(),c=core.createCampaign(db,{name:'Fictional Premium demo',offer:'AI-designed workflows',icp:{industries:['Plumbers'],locations:['Columbus, Ohio']}})
const lead=core.addLeads(db,c.id,[{name:'Alex Example',company:'Fictional Plumbing',website:'https://example.com',source:'manual'}]).added[0];db.close()
const fixture=await premiumFixture(),packaged=process.argv.includes('--packaged')
const app=await electron.launch({...(packaged?{executablePath:resolve('dist/win-unpacked/IV Outreach.exe')}:{args:['.'],cwd:process.cwd()}),env:{...process.env,FITSCOUT_DATA_DIR:data,IV_PREMIUM_API_URL:fixture.url}})
const win=await app.firstWindow(),errors=[];win.on('pageerror',e=>errors.push(String(e)))
try{
 await win.setViewportSize({width:1440,height:1000});await win.waitForSelector('.wordmark')
 await win.click('.nav button:has-text("Settings")');const premium=win.getByRole('region',{name:'IV Outreach Premium'})
 await premium.getByLabel('Account email').fill('demo@iv-outreach.test');await premium.getByRole('button',{name:'Email me a sign-in code'}).click()
 await premium.getByLabel('Email sign-in code').fill('123456');await premium.getByRole('button',{name:'Sign in',exact:true}).click();await premium.locator('.premium-balance').waitFor()
 await premium.scrollIntoViewIfNeeded();await win.screenshot({path:join(out,`${packaged?'packaged-':''}premium-settings.png`)})
 assert.equal(await win.evaluate(()=>window.fitscout.call('appSettings').then(s=>'premiumSessionEnc' in s)),false)
 await win.click('.nav button:has-text("Scanning")');await win.getByRole('button',{name:'Local markets',exact:true}).click()
 await win.getByLabel('Scan location').fill('Columbus, Ohio');await win.getByRole('button',{name:'Save this search',exact:true}).click()
 await win.getByText('Saved searches (1)',{exact:true}).waitFor();await win.getByText('Saved searches (1)',{exact:true}).click()
 await win.screenshot({path:join(out,`${packaged?'packaged-':''}business-scanner.png`)})
 await win.click('.nav button:has-text("Leads")');await win.locator('tbody tr').first().click();await win.getByRole('button',{name:'Quote work email search',exact:true}).click();await win.getByText('Up to 5 credits',{exact:true}).waitFor()
 // Intercept the OS dialog in this fictional development fixture only, and assert it was actually requested.
 await app.evaluate(({dialog})=>{globalThis.approvalCalls=[];dialog.showMessageBox=async(_win,options)=>{globalThis.approvalCalls.push(options);return {response:0}}})
 await win.getByRole('button',{name:'Review and use credits',exact:true}).click()
 await win.getByText(/Paid research was not approved/).waitFor();assert.equal(fixture.store.balance('fictional-demo').available,500)
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(_win,options)=>{globalThis.approvalCalls.push(options);return {response:1}}})
 await win.getByRole('button',{name:'Review and use credits',exact:true}).click();await win.getByRole('button',{name:'Use email',exact:true}).waitFor({timeout:15000})
 const approvals=await app.evaluate(()=>globalThis.approvalCalls);assert.equal(approvals.length,2);assert.equal(approvals[0].defaultId,0);assert.match(approvals[1].message,/5 credits/)
 await win.screenshot({path:join(out,`${packaged?'packaged-':''}paid-result.png`)})
 await win.getByRole('button',{name:'Use email',exact:true}).click();await win.getByText('Provider email saved. Nothing sent.',{exact:true}).waitFor()
 assert.equal(fixture.store.balance('fictional-demo').available,495)
 const check=core.openDb(join(data,'fitscout.db'));assert.equal(core.getLead(check,lead).email,'alex@example.test');assert.equal(core.listMessages(check,{}).length,0);check.close()
 await win.getByRole('button',{name:'Close',exact:true}).click();await win.locator('tbody tr').first().click();await win.getByText('complete',{exact:true}).waitFor()
 assert.deepEqual(errors,[])
 const result={passed:true,packaged,fictionalOnly:true,signIn:true,tokenHidden:true,savedScan:true,denialCharged:0,approvedCharge:5,resultsSurviveDrawerReopen:true,messages:0,errors};writeFileSync(join(out,`${packaged?'packaged-':''}ui.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(e){console.log((await win.locator('main').innerText()).slice(-6000));console.log('UI_ERRORS',errors);await win.screenshot({path:join(out,'failure.png')});throw e}finally{await app.close();await fixture.close()}
