import {createServer,request} from 'node:http'
import {connect,isIP} from 'node:net'
import {lookup} from 'node:dns/promises'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {spawn} from 'node:child_process'

export function publicAddress(ip){
 if(isIP(ip)===6){const first=parseInt(ip.split(':')[0],16);return first>=0x2000&&first<=0x3fff&&!ip.toLowerCase().startsWith('2001:db8:')}
 if(isIP(ip)!==4)return false
 const [a,b,c]=ip.split('.').map(Number)
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)
}
// Pin every browser connection to a checked public IP. No direct/private-network fallback.
export async function auditProxy(){
 const sockets=new Set()
 const track=s=>{sockets.add(s);s.on('error',()=>s.destroy());s.on('close',()=>sockets.delete(s));s.setTimeout(20000,()=>s.destroy());return s}
 const address=async(host,port)=>{if(![80,443].includes(Number(port)))throw Error('Blocked port');const rows=await lookup(host.replace(/^\[|\]$/g,''),{all:true});if(!rows.length||rows.some(r=>!publicAddress(r.address)))throw Error('Blocked host');return rows[0]}
 const server=createServer(async(req,res)=>{
  try{const u=new URL(req.url);if(u.protocol!=='http:'||u.username||u.password||req.method!=='GET')throw Error('Blocked request');const ip=await address(u.hostname,u.port||80)
   const headers={...req.headers,host:u.host};delete headers['proxy-authorization'];delete headers['proxy-connection']
   const upstream=request({host:ip.address,family:ip.family,port:u.port||80,path:u.pathname+u.search,method:'GET',headers,timeout:20000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)})
   upstream.on('socket',track);upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});upstream.on('timeout',()=>upstream.destroy());upstream.end()
  }catch{res.writeHead(403);res.end()}
 })
 server.on('connection',track)
 server.on('connect',async(req,socket,head)=>{try{const u=new URL(`https://${req.url}`),ip=await address(u.hostname,u.port||443);if(u.username||u.password)throw Error('Blocked')
  const upstream=track(connect({host:ip.address,port:Number(u.port||443),family:ip.family},()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)}));socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy())
 }catch{socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')}})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 return {port:server.address().port,close(){for(const s of sockets)s.destroy();server.close()}}
}
// Chrome or Edge for Lighthouse: Program Files or the user's folder on Windows; the app bundles in /Applications (or
// ~/Applications) on a Mac.
export function auditBrowser(){if(process.platform==='darwin')return [['Google Chrome','Google Chrome'],['Microsoft Edge','Microsoft Edge'],['Chromium','Chromium'],['Brave Browser','Brave Browser']].flatMap(([app,bin])=>['/Applications',join(process.env.HOME||'','Applications')].map(dir=>join(dir,`${app}.app`,'Contents','MacOS',bin))).find(existsSync)||null
return [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(root=>[join(root,'Google','Chrome','Application','chrome.exe'),join(root,'Microsoft','Edge','Application','msedge.exe')]).find(existsSync)||null}
let running=false,activeTask=null
export async function stopOpportunityAudit(){if(!activeTask)return;const task=activeTask;task.canceled=true;task.cancel?.();await task.done}
export async function runOpportunityAudit(url){
 const chromePath=auditBrowser();if(!chromePath)return {state:'unavailable',reason:'Install Chrome or Edge for Lighthouse audits. Website research still works.'}
 if(running)return {state:'unavailable',reason:'Another browser audit is running. Try this audit again shortly.'}
 running=true;let chrome,proxy,timer,finish
 const task={canceled:false,done:new Promise(resolve=>{finish=resolve})};activeTask=task
 try{
  const [{default:lighthouse},{Launcher}]=await Promise.all([import('lighthouse'),import('chrome-launcher')])
  if(task.canceled)throw Error('Audit canceled')
  proxy=await auditProxy()
  if(task.canceled)throw Error('Audit canceled')
  chrome=new Launcher({chromePath,handleSIGINT:false,logLevel:'silent',chromeFlags:['--headless=new','--disable-quic','--disable-background-networking',`--proxy-server=http://127.0.0.1:${proxy.port}`,'--proxy-bypass-list=<-loopback>']},{spawn:(cmd,args,opts)=>spawn(cmd,args,{...opts,windowsHide:true})})
  await chrome.launch()
  if(task.canceled)throw Error('Audit canceled')
  const result=await Promise.race([lighthouse(url,{port:chrome.port,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo'],maxWaitForLoad:25000,formFactor:'desktop',screenEmulation:{mobile:false,width:1350,height:940,deviceScaleFactor:1,disabled:false}}),new Promise((_,reject)=>{task.cancel=()=>reject(Error('Audit canceled'));timer=setTimeout(()=>reject(Error('Audit timed out')),90000)})])
  const lhr=result?.lhr;if(!lhr||lhr.runtimeError)throw Error('Audit failed')
  return {state:'complete',version:lhr.lighthouseVersion,at:lhr.fetchTime,url:lhr.finalDisplayedUrl||url,categories:Object.values(lhr.categories).map(c=>({id:c.id,title:c.title,score:c.score===null?null:Math.round(c.score*100)})),findings:Object.values(lhr.audits).filter(a=>a.score!==null&&a.score<1&&['binary','numeric'].includes(a.scoreDisplayMode)).slice(0,12).map(a=>({id:a.id,title:a.title,detail:a.displayValue||'',score:a.score})),note:'Local Lighthouse lab run through a public-network proxy. Results vary with device, network and page state; these are not field measurements.'}
 }finally{clearTimeout(timer);try{await chrome?.kill()}finally{proxy?.close();running=false;activeTask=null;finish()}}
}
