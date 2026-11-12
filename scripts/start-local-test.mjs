import {spawn} from 'node:child_process'
import {mkdirSync,openSync,closeSync,existsSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const project=dirname(dirname(fileURLToPath(import.meta.url)))
async function ready(){try{const h=await fetch('http://127.0.0.1:4319/health',{signal:AbortSignal.timeout(1500)}).then(r=>r.json());return h.service==='iv-outreach-premium'&&h.local_test}catch{return false}}
try{
 if(!await ready()){
  const root=join(process.env.APPDATA,'IVOutreachPremiumTest');mkdirSync(root,{recursive:true})
  const log=openSync(join(root,'startup.log'),'a'),error=openSync(join(root,'startup-error.log'),'a')
  const child=spawn(process.execPath,[join(project,'server/local-runner.mjs')],{cwd:project,detached:true,windowsHide:true,stdio:['ignore',log,error]});child.unref();closeSync(log);closeSync(error)
  const until=Date.now()+50000
  while(!await ready()){if(Date.now()>until)throw Error('Local billing did not start. Check status.json in AppData/Roaming/IVOutreachPremiumTest. The dedicated Stripe test login may need renewal.');await new Promise(r=>setTimeout(r,750))}
 }
 const app=join(process.env.LOCALAPPDATA,'Programs','IV Outreach','IV Outreach.exe');if(!existsSync(app))throw Error('Install IV Outreach first.')
 const child=spawn(app,[],{cwd:dirname(app),detached:true,stdio:'ignore'});child.unref()
 console.log('Local test billing is ready and IV Outreach is open.')
}catch(e){console.error(e.message);process.exitCode=1}
