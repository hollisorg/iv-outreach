// Native authorization-code + PKCE flow. Tokens stay in main-process encrypted storage.
import {createServer} from 'node:http'
import {randomBytes,createHash,timingSafeEqual,randomUUID} from 'node:crypto'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import {simpleParser} from 'mailparser'
import {getSetting,setSetting,now} from '../core/db.js'
import {handleIncoming} from '../core/mailer.js'

const REDIRECT='http://127.0.0.1:43191/callback'
const DEFINITIONS={
 google:{auth:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',api:'https://gmail.googleapis.com/gmail/v1/users/me'},
 microsoft:{auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',scope:'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send',api:'https://graph.microsoft.com/v1.0/me'},
}
export const pkce=()=>{const verifier=randomBytes(48).toString('base64url');return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')}}
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)}
export class MailOAuth{
 constructor({read,write,open,fetcher=fetch}){this.read=read;this.write=write;this.open=open;this.fetch=fetcher;this.pending=null;this.refreshing=null;this.generation=0}
 status(){const s=this.read()||{},c=s.connection;return {connected:!!c,provider:c?.provider||null,email:c?.email||null,pending:!!(this.pending||this.connecting),redirect:REDIRECT,configured:Object.fromEntries(Object.keys(DEFINITIONS).map(p=>[p,!!s.config?.[p]?.client_id]))}}
 configure({provider,client_id,client_secret=''}){if(!Object.hasOwn(DEFINITIONS,provider))throw Error('Choose Google or Microsoft.');if(typeof client_id!=='string'||!client_id.trim()||client_id.length>300||/[\s\r\n]/.test(client_id.trim()))throw Error('Enter the registered desktop application client ID.');if(typeof client_secret!=='string'||client_secret.length>300)throw Error('Invalid desktop client secret.');if(this.pending||this.connecting)throw Error('Finish or cancel sign-in first.');const s=this.read()||{};if(s.connection?.provider===provider)throw Error('Disconnect this mailbox before changing its registration.');this.write({...s,config:{...s.config,[provider]:{client_id:client_id.trim(),...(provider==='google'&&client_secret?{client_secret}:{})}}});return this.status()}
 cancel(){this.generation++;this.pending?.cancel();return this.status()}
 disconnect(){this.generation++;this.cancel();const s=this.read()||{};delete s.connection;this.write(s);return this.status()}
 async json(url,options={}){const r=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Mailbox provider rejected the request. Reconnect or check the app registration.');return r.status===202?{}:r.json()}
 async connect(provider){if(this.connecting)throw Error('A mailbox sign-in is already open.');this.connecting=true;this.generation++;try{return await this.authorize(provider)}finally{this.connecting=false}}
 async authorize(provider){
  if(!Object.hasOwn(DEFINITIONS,provider))throw Error('Choose Google or Microsoft.')
  if(this.pending)throw Error('A mailbox sign-in is already open.')
  const generation=this.generation,config=this.read()?.config?.[provider],def=DEFINITIONS[provider];if(!config?.client_id)throw Error('Configure this provider’s desktop app registration first.')
  const {verifier,challenge}=pkce(),state=randomBytes(32).toString('hex');let server,timer,finished=false
  const codePromise=new Promise((resolve,reject)=>{
   const finish=(error,code)=>{if(finished)return;finished=true;clearTimeout(timer);server?.close();server?.closeAllConnections();this.pending=null;error?reject(error):resolve(code)}
   this.pending={cancel:()=>finish(Error('Mailbox sign-in canceled.'))}
   server=createServer((req,res)=>{res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'");const u=new URL(req.url,REDIRECT)
    if(req.method!=='GET'||u.pathname!=='/callback'||!same(u.searchParams.get('state'),state)){res.writeHead(400);res.end('Invalid sign-in response.');return}
    const code=u.searchParams.get('code');if(u.searchParams.has('error')||!code||code.length>4000){res.end('Sign-in was not completed. Return to IV Outreach.');setImmediate(()=>finish(Error('Mailbox sign-in was declined.')));return}
    res.end('Sign-in received. Return to IV Outreach to finish connecting.');setImmediate(()=>finish(null,code))
   })
   server.once('error',()=>finish(Error('Mailbox sign-in port is busy. Close another sign-in and try again.')))
   server.listen(43191,'127.0.0.1',async()=>{const url=new URL(def.auth);for(const [k,v]of Object.entries({client_id:config.client_id,redirect_uri:REDIRECT,response_type:'code',scope:def.scope,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'consent',...(provider==='google'?{access_type:'offline'}:{})}))url.searchParams.set(k,v);try{await this.open(url.href)}catch{finish(Error('Could not open the browser.'))}})
   timer=setTimeout(()=>finish(Error('Mailbox sign-in timed out.')),5*60e3)
  })
  const code=await codePromise
  const token=await this.json(def.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...config,code,code_verifier:verifier,redirect_uri:REDIRECT,grant_type:'authorization_code'})})
  if(!token.access_token||!token.refresh_token)throw Error('Offline mailbox permission was not granted. Reconnect and approve access.')
  const profile=await this.json(provider==='google'?`${def.api}/profile`:`${def.api}?$select=mail,userPrincipalName`,{headers:{Authorization:`Bearer ${token.access_token}`}})
  const email=String(provider==='google'?profile.emailAddress:(profile.mail||profile.userPrincipalName)).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Could not identify the signed-in mailbox.')
  if(generation!==this.generation)throw Error('Mailbox connection was canceled.')
  const s=this.read()||{};this.write({...s,connection:{provider,email,access_token:token.access_token,refresh_token:token.refresh_token,expires:Date.now()+(Number(token.expires_in)||3600)*1000}});return this.status()
 }
 async token(){
  const s=this.read()||{},c=s.connection;if(!c)throw Error('Connect a mailbox first.');if(c.expires>Date.now()+60000)return c
  if(!this.refreshing){const generation=this.generation;this.refreshing=(async()=>{const t=await this.json(DEFINITIONS[c.provider].token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...s.config[c.provider],refresh_token:c.refresh_token,grant_type:'refresh_token'})});if(!t.access_token)throw Error('Reconnect the mailbox.');if(generation!==this.generation)throw Error('Mailbox disconnected.');const connection={...c,access_token:t.access_token,refresh_token:t.refresh_token||c.refresh_token,expires:Date.now()+(Number(t.expires_in)||3600)*1000};this.write({...this.read(),connection});return connection})().finally(()=>{this.refreshing=null})}
  return this.refreshing
 }
 async request(path,options={}){const c=await this.token();return this.json(DEFINITIONS[c.provider].api+path,{...options,headers:{...options.headers,Authorization:`Bearer ${c.access_token}`}})}
 transport(){return {sendMail:async mail=>{const c=await this.token(),from=typeof mail.from==='object'?mail.from.address:String(mail.from).match(/<([^>]+)>/)?.[1]||mail.from;if(String(from).toLowerCase()!==c.email)throw Error('Sender email must match the connected mailbox.');const messageId=`<${randomUUID()}@iv-outreach.local>`,mime=await new MailComposer({...mail,messageId}).compile().build();if(c.provider==='google')await this.request('/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:mime.toString('base64url')})});else await this.request('/sendMail',{method:'POST',headers:{'Content-Type':'text/plain'},body:mime.toString('base64')});return {messageId}}}}
 async checkReplies(db){
  const c=await this.token(),known=new Set(db.prepare("select distinct l.email from leads l join messages m on m.lead_id=l.id where m.channel='email' and m.status='sent' and l.email is not null").all().map(r=>r.email.toLowerCase())),result={checked:0,replies:0,bounces:0}
  if(!known.size)return result
  const scope=`oauth-mail-seen:${c.provider}:${c.email}`,seen=getSetting(db,scope,[]),fresh=[];let messages=[]
  if(c.provider==='google'){
   const q=`newer_than:14d {${[...known].slice(-50).map(e=>`from:${e}`).join(' ')}}`
   const data=await this.request(`/messages?maxResults=50&q=${encodeURIComponent(q)}`);messages=data.messages||[]
  }else{const since=new Date(Date.now()-14*864e5).toISOString();const data=await this.request(`/mailFolders/inbox/messages?$top=100&$select=id,from,receivedDateTime&$orderby=receivedDateTime%20desc&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`);messages=(data.value||[]).filter(m=>known.has(String(m.from?.emailAddress?.address||'').toLowerCase()))}
  for(const m of messages.filter(m=>!seen.includes(m.id)).slice(0,50)){
   let raw
   if(c.provider==='google'){const data=await this.request(`/messages/${encodeURIComponent(m.id)}?format=raw`);if(!data.raw)continue;raw=Buffer.from(data.raw,'base64url')}
   else{const token=await this.token();const r=await this.fetch(`${DEFINITIONS.microsoft.api}/messages/${encodeURIComponent(m.id)}/$value`,{headers:{Authorization:`Bearer ${token.access_token}`},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Could not read a reply.');raw=Buffer.from(await r.arrayBuffer())}
   if(raw.length>5_000_000)continue
   const parsed=await simpleParser(raw);const match=handleIncoming(db,parsed);result.checked++;if(match?.kind==='reply')result.replies++;if(match?.kind==='bounce')result.bounces++;fresh.push(m.id)
   setSetting(db,scope,[...fresh,...seen].slice(0,2000))
  }
  setSetting(db,'mail_last_check',{at:now(),...result});return {...result,note:'Checked a bounded recent window. Use existing mailbox tools for older messages.'}
 }
}
