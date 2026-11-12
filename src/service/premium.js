// Only the main process handles IV access tokens. Shared provider/Stripe keys never enter this app.
import { createServer } from 'node:http'
import { randomBytes,timingSafeEqual } from 'node:crypto'
import { writeFileSync,readFileSync,rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import endpoint from './premium-endpoint.json' with {type:'json'}
function localConnection(){try{const value=JSON.parse(readFileSync(join(process.env.APPDATA||join(homedir(),'.config'),'IVOutreachPremiumTest','connection.json'),'utf8'));return value.url==='http://127.0.0.1:4319'&&/^\w{64}$/.test(value.token)?value:null}catch{return null}}
export class PremiumClient {
  constructor({readSession,writeSession,base=process.env.IV_PREMIUM_API_URL||endpoint.url||localConnection()?.url||'',fetcher=fetch}){this.readSession=readSession;this.writeSession=writeSession;this.fetch=fetcher;this.base=base.replace(/\/$/,'');this.refreshing=null
    if(this.base){const u=new URL(this.base);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&u.hostname==='127.0.0.1')))throw new Error('Invalid Premium service address.')}
  }
  async request(path,body=null,auth=true){
    if(!this.base)throw new Error('Premium service is not connected yet. Free research works without it.')
    let s=this.readSession()
    if(auth){if(!s)throw new Error('Sign in to your IV Outreach account first.');if(s.expires_at*1000<Date.now()+60000){
      if(!this.refreshing)this.refreshing=this.request('/v1/auth/refresh',{refresh_token:s.refresh_token},false).then(v=>{this.writeSession(v);return v}).finally(()=>{this.refreshing=null})
      s=await this.refreshing
    }}
    let r;try{r=await this.fetch(this.base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${s.access_token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})}catch{throw new Error('Premium service is unavailable. Your free tools still work. Refresh before retrying a paid job.')}
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Premium request failed.');return data
  }
  async status(){if(!this.base)return {configured:false,signed_in:false,premium:false,available:0,history:[],jobs:[]}
    const s=this.readSession();const value=await this.request(s?'/v1/account':'/v1/config',null,!!s);return {...value,configured:true,signed_in:!!s}
  }
  start(email){return this.request('/v1/auth/start',{email},false)}
  async connectLocal(){const local=localConnection();if(!local||this.base!==local.url)throw Error('Start the local Premium test backend first.');const info=await this.request('/v1/config',null,false);if(info.auth_mode!=='local_test'||!info.test_mode)throw Error('This service is not a local test backend.');const s=await this.request('/v1/auth/refresh',{refresh_token:local.token},false);this.writeSession(s);return this.status()}
  async verify(email,code){const s=await this.request('/v1/auth/verify',{email,code},false);this.writeSession(s);return this.status()}
  signOut(){this.writeSession(null);return true}
}

export async function startPremiumBridge(dataDir,operations){
  const token=randomBytes(32).toString('hex'),file=join(dataDir,'premium-bridge.json')
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
    const got=Buffer.from(req.headers.authorization||''),want=Buffer.from(`Bearer ${token}`)
    if(req.method!=='POST'||req.headers.origin||got.length!==want.length||!timingSafeEqual(got,want)){res.writeHead(403);res.end('{"error":"Not authorized"}');return}
    try{let body='';for await(const chunk of req){body+=chunk.toString('utf8');if(body.length>16384)throw new Error('Request too large.')}
      const name=req.url.slice(1);if(!Object.hasOwn(operations,name))throw new Error('Unknown Premium operation.')
      const result=await operations[name](JSON.parse(body||'{}'));res.end(JSON.stringify(result))
    }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}))}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  writeFileSync(file,JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,token}),{mode:0o600})
  return {close(){server.close();server.closeAllConnections();try{rmSync(file)}catch{}}}
}
export async function premiumBridge(dataDir,operation,args={}){
  let b;try{b=JSON.parse(readFileSync(join(dataDir,'premium-bridge.json'),'utf8'))}catch{throw new Error('Open IV Outreach to use Premium. Free research tools are still available.')}
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(b.url)||!/^\w{64}$/.test(b.token)||!['status','quote','run','job','cancel'].includes(operation))throw new Error('Restart IV Outreach to reconnect Premium.')
  const r=await fetch(`${b.url}/${operation}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(operation==='run'?10*60e3:25000),headers:{Authorization:`Bearer ${b.token}`,'Content-Type':'application/json'},body:JSON.stringify(args)})
  const result=await r.json();if(!r.ok)throw new Error(result.error||'Premium operation failed.');return result
}
