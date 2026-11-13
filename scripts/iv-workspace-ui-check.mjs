// Three real app windows, one disposable shared workspace; no accounts, sends or generation.
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
import * as signalCore from '../.runtime/iv-connect/signal/src/core/index.js'
import { IVWorkspace } from '../src/service/iv-workspace.js'
const packaged=process.argv.includes('--packaged'),root=resolve('.'),paths={outreach:root,studio:resolve('.runtime/iv-connect/studio'),signal:resolve('.runtime/iv-connect/signal')}
const out=resolve('docs/verification/iv-workspace');mkdirSync(out,{recursive:true})
const data=mkdtempSync(join(tmpdir(),'iv-apps-ui-')),dirs=Object.fromEntries(['outreach','studio','signal','shared'].map(n=>[n,join(data,n)]));Object.values(dirs).forEach(p=>mkdirSync(p,{recursive:true}))
const names={outreach:'IV Outreach',studio:'IV Studio',signal:'IV Signal'},exes=Object.fromEntries(Object.keys(paths).map(n=>[n,packaged?join(paths[n],'dist','win-unpacked',`${names[n]}.exe`):resolve('node_modules/electron/dist/electron.exe')]))
const env={...process.env,FITSCOUT_DATA_DIR:dirs.outreach,IV_STUDIO_DATA:dirs.studio,IV_STUDIO_USER_DATA:join(dirs.studio,'browser'),IV_SIGNAL_DATA_DIR:dirs.signal,IV_WORKSPACE_DIR:dirs.shared,IV_WORKSPACE_TEST:'1',IV_WORKSPACE_TEST_APPS:JSON.stringify(exes),IV_WORKSPACE_NO_LAUNCH:packaged?'0':'1',IV_SIGNAL_TEST_NO_OPEN:'1',IV_SIGNAL_UPDATE_NO_INSTALL:'1',IV_STUDIO_UPDATE_FEED:'http://127.0.0.1:9'}
writeFileSync(join(dirs.studio,'settings.json'),JSON.stringify({onboarded:true,comfyAutoStart:false,comfyUrl:'http://127.0.0.1:9',updateCheck:false}))
writeFileSync(join(dirs.outreach,'app-settings.json'),JSON.stringify({automaticUpdateChecks:false}))
const db=core.openDb(join(dirs.outreach,'fitscout.db')),business=core.createBusiness(db,{name:'Fictional IV partner',profile:{voice:'Friendly and practical',offer:'Helpful services',website:'https://example.com'}}),campaign=core.createCampaign(db,{business_id:business.id,name:'Fictional shared campaign',offer:'Explain appointment booking',icp:{locations:['Ohio']}});db.close()
const sd=signalCore.openDb(join(dirs.signal,'signal.db'));signalCore.setSetting(sd,'iv_signal_onboarding_v1',{dismissedAt:new Date().toISOString()});sd.close()
const apps={},wins={},errors=[]
const capture = async (win,path) => { if(process.env.IV_NO_SCREENSHOTS!=='1')await win.screenshot({path}) }
async function launch(n,args=[]) { apps[n]=await electron.launch({executablePath:exes[n],args:packaged?args:[paths[n],...args],cwd:paths[n],env});wins[n]=await apps[n].firstWindow();wins[n].on('pageerror',e=>errors.push(`${n}: ${e}`));await wins[n].setViewportSize({width:1440,height:1000});await wins[n].getByRole('button',{name:'Hivemind',exact:true}).waitFor();return wins[n] }
const api=(n,method,args)=>wins[n].evaluate(([n,m,a])=>n==='studio'?window.ivstudio.workspace.call(m,a):(n==='signal'?window.ivsignal:window.fitscout).call('ivWorkspace',{method:m,args:a}),[n,method,args])
const call=(n,m,a)=>wins[n].evaluate(([n,m,a])=>(n==='signal'?window.ivsignal:window.fitscout).call(m,a),[n,m,a])
const deliver=async(n,id)=>{if(!packaged)await apps[n].evaluate(({app},id)=>app.emit('second-instance',{},[`--iv-handoff=${id}`]),id)}
try {
 for(const n of ['studio','signal','outreach'])await launch(n)
 const brief=await call('outreach','contentBrief',{campaign_id:campaign.id,goal:'Explain helpful appointment booking',angle:'One practical example',channel:'LinkedIn'})
 const h=await call('outreach','briefHandoff',{campaign_id:campaign.id,id:brief.id,target:'studio'});await deliver('studio',h.id)
 await wins.studio.getByText('Explain helpful appointment booking',{exact:true}).first().waitFor({timeout:20000})
 await wins.studio.getByRole('button',{name:'Hivemind',exact:true}).click()
 await wins.studio.getByRole('heading',{name:'Hivemind',exact:true}).waitFor()
 assert.equal(await wins.studio.locator('.ivw-brand-heading .hm-mark img').evaluate(i=>i.complete&&i.naturalWidth>0),true)
 await wins.studio.emulateMedia({reducedMotion:'reduce'})
 assert.equal(await wins.studio.locator('.ivw-brand-heading .hm-mark img').evaluate(i=>getComputedStyle(i).animationName),'none')
 await wins.studio.emulateMedia({reducedMotion:'no-preference'})
 await wins.studio.getByRole('heading',{name:'Prepare your social draft',exact:true}).waitFor()
 await wins.studio.getByLabel('Caption',{exact:true}).fill('Here is a practical way to make appointment booking easier.')
 const media=join(data,'fixture.png');writeFileSync(media,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'))
 await apps.studio.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},media)
 await wins.studio.getByRole('button',{name:'Choose finished pictures or videos',exact:true}).click()
 await wins.studio.getByRole('button',{name:'Remove fixture.png from handoff',exact:true}).waitFor()
 await wins.studio.getByRole('button',{name:'Prepare in IV Signal ↗',exact:true}).click()
 await wins.studio.getByRole('status').filter({hasText:'Opening your draft in IV Signal'}).waitFor()
 await wins.studio.getByText('Signal is opening your draft. Review it there before approving.',{exact:true}).waitFor()
 const studioState=await api('studio','state'),next=studioState.handoffs.find(x=>x.parentId===h.id);assert.ok(next);await deliver('signal',next.id)
 await wins.signal.getByText('Here is a practical way to make appointment booking easier.',{exact:true}).first().waitFor({timeout:20000})
 const sdb=signalCore.openDb(join(dirs.signal,'signal.db'));const posts=sdb.prepare('select * from posts').all();assert.equal(posts.length,1);assert.equal(posts[0].status,'draft');assert.equal(sdb.prepare('select count(*) n from approvals').get().n,0);assert.equal(sdb.prepare('select count(*) n from deliveries').get().n,0);assert.equal(sdb.prepare('select count(*) n from media').get().n,1);sdb.close()
 const receipt=await api('signal','receive',{id:next.id});assert.equal(receipt.id,posts[0].id)
 const previousReceipt=(await api('signal','state')).handoffs.find(x=>x.id===next.id).receipt.at
 await api('outreach','open',{id:next.id});await deliver('signal',next.id)
 await wins.signal.waitForFunction(async ([id,at])=>{
  const state=await window.ivsignal.call('ivWorkspace',{method:'state'})
  const receipt=state.handoffs.find(item=>item.id===id)?.receipt
  return Boolean(receipt && receipt.at!==at && state.pending===null)
 },[next.id,previousReceipt],{timeout:15000})
 const reopenedSignal=await api('signal','state');assert.equal(reopenedSignal.handoffs.find(x=>x.id===next.id).receipt.id,posts[0].id)
 const w=new IVWorkspace({root:dirs.shared,appId:'outreach',profile:dirs.outreach});const shared=w.brand(h.brandId);w.saveBrand({...shared,voice:'A clear shared voice'},shared.revision);w.close()
 await api('outreach','state');await api('signal','state')
 const odb=core.openDb(join(dirs.outreach,'fitscout.db'));assert.equal(core.getBusiness(odb,business.id).profile.voice,'A clear shared voice');assert.equal(core.listMessages(odb,{}).length,0);odb.close()
 const check=signalCore.openDb(join(dirs.signal,'signal.db'));assert.equal(signalCore.getBrand(check,receipt.localId).profile.voice,'A clear shared voice');check.close()
 await wins.outreach.getByRole('button',{name:'Hivemind',exact:true}).click()
 await wins.outreach.getByRole('button',{name:'Shared businesses',exact:true}).click()
 await wins.outreach.locator('.ivw-brands').getByRole('button',{name:/Fictional IV partner/}).click()
 for(const width of [1440,1040]){await wins.outreach.setViewportSize({width,height:1000});assert.ok(await wins.outreach.locator('.ivw-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1))}
 await capture(wins.outreach,join(out,`${packaged?'packaged-':''}shared-brand.png`))
 for(const n of ['studio','signal'])await capture(wins[n],join(out,`${packaged?'packaged-':''}${n}.png`))
 await apps.studio.close();delete apps.studio
 await launch('studio',[`--iv-handoff=${h.id}`])
 await wins.studio.getByText('Explain helpful appointment booking',{exact:true}).first().waitFor({timeout:20000})
 const reopened=await api('studio','state');assert.equal(reopened.handoffs.find(x=>x.id===h.id).receipt.id,studioState.handoffs.find(x=>x.id===h.id).receipt.id)
 assert.deepEqual(errors,[])
 const result={passed:true,packaged,fictionalOnly:true,sharedBrand:true,studioProject:true,signalDraft:true,mediaCopied:true,retryNoDuplicate:true,reopenWhileRunning:true,coldLaunch:true,noApprovals:true,noPublishing:true,brandSyncBothApps:true,hivemindLogo:true,reducedMotion:true,handoffLoading:true,errors}
 writeFileSync(join(out,`${packaged?'packaged-':''}result.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(e){for(const n of Object.keys(wins)){await capture(wins[n],join(out,`failure-${n}.png`)).catch(()=>{});console.log(n,(await wins[n].locator('body').innerText().catch(()=>'' )).slice(-1300))}console.log(errors);throw e}finally{for(const a of Object.values(apps))await a.close().catch(()=>{})}
