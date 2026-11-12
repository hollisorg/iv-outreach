// Open a disposable, visibly marked Premium demonstration, using only fictional data.
import {spawn} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import * as core from '../src/core/index.js'
import {premiumFixture} from './premium-fixture.mjs'
const data=mkdtempSync(join(tmpdir(),'iv-premium-demo-'));process.env.FITSCOUT_DATA_DIR=data
const db=core.openDb(),c=core.createCampaign(db,{name:'DEMO — Fictional businesses',offer:'AI-designed services',icp:{industries:['Plumbers'],locations:['Columbus, Ohio']}})
core.addLeads(db,c.id,[{name:'Alex Example',company:'Fictional Plumbing',website:'https://example.com',source:'manual'}]);db.close()
const fixture=await premiumFixture(),exe=resolve('node_modules/electron/dist/electron.exe')
const child=spawn(exe,['.'],{cwd:process.cwd(),windowsHide:false,env:{...process.env,FITSCOUT_DATA_DIR:data,IV_PREMIUM_API_URL:fixture.url},stdio:'ignore'})
console.log('Fictional Premium demo: Settings > Premium. Email demo@iv-outreach.test; code 123456. No emails, purchases or provider calls.')
child.once('exit',async()=>{await fixture.close();process.exit(0)})
child.once('error',async()=>{await fixture.close();process.exit(1)})
