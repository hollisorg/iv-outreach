import {_electron as electron} from 'playwright'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
import {opportunityScan} from '../src/core/opportunities.js'
import {premiumFixture} from './premium-fixture.mjs'
const out=resolve('docs/verification/iv-growth');mkdirSync(out,{recursive:true})
const data=mkdtempSync(join(tmpdir(),'iv-growth-ui-'));process.env.FITSCOUT_DATA_DIR=data
const db=core.openDb(),c=core.createCampaign(db,{name:'Fictional growth campaign',offer:'AI booking and content',icp:{locations:['Ohio']}}),lead=core.addLeads(db,c.id,[{company:'Example business (fixture)',website:'https://example.com'}]).added[0]
await opportunityScan(db,{campaign_id:c.id,lead_id:lead},{fetcher:async(url,opts={})=>{if(opts.beforeFetch)await opts.beforeFetch(new URL(url));return {url,status:url.endsWith('robots.txt')?404:200,text:url.endsWith('robots.txt')?'':'<html><title>Fictional services</title><body><h1>Fixture business</h1><p>Fictional business providing booking services.</p></body></html>'}},audit:async()=>({state:'complete',note:'Fictional audit fixture',categories:[{id:'performance',title:'Performance',score:91},{id:'seo',title:'SEO',score:80}]})});db.close()
writeFileSync(join(data,'app-settings.json'),JSON.stringify({automaticUpdateChecks:false}))
const fixture=await premiumFixture(),packaged=process.argv.includes('--packaged')
const app=await electron.launch({...(packaged?{executablePath:resolve('dist/win-unpacked/IV Outreach.exe')}:{args:['.'],cwd:process.cwd()}),env:{...process.env,FITSCOUT_DATA_DIR:data,IV_PREMIUM_API_URL:fixture.url}})
const win=await app.firstWindow(),errors=[];win.on('pageerror',e=>errors.push(String(e)))
const api=(name,args)=>win.evaluate(([n,a])=>window.fitscout.call(n,a),[name,args])
const gallery=async()=>{if(await win.getByRole('button',{name:'← All scans',exact:true}).count())await win.getByRole('button',{name:'← All scans',exact:true}).click();else await win.click('.nav button:has-text("Scanning")')}
try{
 await win.setViewportSize({width:1440,height:1000});await win.waitForSelector('.wordmark')
 await api('premiumSignIn',{email:'demo@iv-outreach.test'});await api('premiumVerify',{email:'demo@iv-outreach.test',code:'123456'})
 await win.click('.nav button:has-text("Scanning")');assert.equal(await win.locator('.scan-workflow-card').count(),7)
 await win.getByRole('button',{name:'Opportunity scan',exact:true}).click();await win.getByLabel('Business to scan').selectOption(lead);await win.getByText('Fictional audit fixture',{exact:true}).waitFor();assert.equal(await win.getByText('No meta description found',{exact:true}).count(),1)
 for(const width of [1440,1040]){await win.setViewportSize({width,height:1000});assert.ok(await win.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`overflow at ${width}`)}
 await win.setViewportSize({width:1440,height:1000});await win.locator('.scan-workspace').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));await win.locator('.growth-result').scrollIntoViewIfNeeded();await win.screenshot({path:join(out,`${packaged?'packaged-':''}opportunity.png`)})
 await gallery();await win.getByRole('button',{name:'Watchlists & news',exact:true}).click();await win.locator('.growth-workspace select').first().selectOption(lead);await win.getByLabel('Label',{exact:true}).fill('Service updates');await win.getByRole('button',{name:'Add to watchlist',exact:true}).click();await win.getByRole('heading',{name:'Service updates',exact:true}).waitFor();await win.getByRole('button',{name:'Remove',exact:true}).click();await win.getByRole('heading',{name:'Service updates',exact:true}).waitFor({state:'detached'})
 await gallery();await win.getByRole('button',{name:'Content briefs',exact:true}).click();await win.getByLabel('Research subject (optional)').selectOption(lead);await win.getByLabel('Content goal').fill('Explain AI booking');await win.getByRole('button',{name:'Create content brief',exact:true}).click();await win.getByRole('heading',{name:'Explain AI booking',exact:true}).waitFor();await win.getByRole('button',{name:'Copy brief',exact:true}).click();assert.match(await app.evaluate(({clipboard})=>clipboard.readText()),/Fictional services/)
 // Only fixture-native dialogs are intercepted. Real provider keys are absent.
 await app.evaluate(({dialog})=>{globalThis.approvals=[];dialog.showMessageBox=async(_win,options)=>{globalThis.approvals.push(options);return {response:0}}})
 await gallery();await win.getByRole('button',{name:'Premium discovery',exact:true}).click();await win.getByLabel('What companies should we look for?').fill('Fictional companies in Ohio');await win.getByRole('button',{name:'Get credit quote',exact:true}).click();await win.getByRole('heading',{name:'Up to 2 IV credits',exact:true}).waitFor();await win.getByRole('button',{name:'Review and run search',exact:true}).click();await win.getByText('Paid research was not approved. No credits used.',{exact:true}).waitFor();assert.equal(fixture.store.balance('fictional-demo').available,500)
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(_win,options)=>{globalThis.approvals.push(options);return {response:1}}})
 await win.getByRole('button',{name:'Review and run search',exact:true}).click();await win.locator('.growth-candidate').waitFor({timeout:15000});await win.locator('.growth-candidate').click();await win.getByRole('button',{name:'Add 1 candidates to leads',exact:true}).click();await win.getByText(/1 added; 0 duplicates/).waitFor();assert.equal(fixture.store.balance('fictional-demo').available,498)
 const approvals=await app.evaluate(()=>globalThis.approvals);assert.equal(approvals.length,2);assert.equal(approvals[0].defaultId,0);assert.match(approvals[1].detail,/even with no matches/)
 const history=await api('premiumSearchHistory',{campaign_id:c.id});const again=await api('premiumImport',{campaign_id:c.id,job_id:history[0].job_id,refs:['demo-candidate']});assert.equal(again.added,0)
 await win.click('.nav button:has-text("Settings")');await win.locator('#setup-mailbox').scrollIntoViewIfNeeded();await win.getByText(/Awaiting app registration/).waitFor();assert.equal(await win.getByRole('button',{name:'Connect Google',exact:true}).isDisabled(),true);assert.equal(await win.getByRole('button',{name:'Connect Microsoft',exact:true}).isDisabled(),true);assert.equal('mailOAuthEnc' in await api('appSettings'),false)
 const check=core.openDb(join(data,'fitscout.db'));assert.equal(core.listLeads(check,{campaign_id:c.id}).length,2);assert.equal(core.listMessages(check,{}).length,0);check.close()
 let liveAudit=false;if(process.argv.includes('--live-audit')){const scan=await api('opportunityScan',{campaign_id:c.id,lead_id:lead});assert.equal(scan.lighthouse.state,'complete',JSON.stringify(scan.lighthouse));writeFileSync(join(out,'example-com-audit.json'),JSON.stringify(scan,null,2));liveAudit=true}
 assert.deepEqual(errors,[]);const result={passed:true,packaged,fixtureOnly:!liveAudit,liveAudit,scanningModes:7,opportunityEvidence:true,widths:[1440,1040],watchSaveRemove:true,briefClipboard:true,paidDeniedCharge:0,paidApprovedCharge:2,repeatImportAdded:0,mailboxSetupHonest:true,messages:0,errors};writeFileSync(join(out,`${packaged?'packaged-':''}ui.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(e){console.log((await win.locator('main').innerText()).slice(-4000));console.log(errors);await win.screenshot({path:join(out,'failure.png')});throw e}finally{await app.close();await fixture.close()}
