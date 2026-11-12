import { createServer } from 'node:http'
import { fail } from './store.mjs'
import { normalize,CATALOG,worker } from './providers.mjs'
export function createApp({store,config,billing,auth,providers,demo=false}){
  const buckets=new Map()
  function limit(key,n,period){const now=store.clock(),old=buckets.get(key);const b=old&&old.until>now?old:{n:0,until:now+period};if(++b.n>n)fail('Please wait before trying again.',429);buckets.set(key,b);if(buckets.size>10000)for(const [k,v]of buckets)if(v.until<=now)buckets.delete(k)}
  const catalog=()=>({test_mode:!config.live,demo,auth_mode:config.localTest?'local_test':'email',account_ready:!!(demo||config.localTest||(config.supabaseUrl&&config.supabaseKey)),billing_ready:!!(billing.stripe&&config.webhookSecret),
    plans:{premium:{name:'IV Outreach Premium',amount:config.premiumCents,currency:'usd',interval:'month',credits:config.premiumCredits},topup:{amount:config.topupCents,credits:config.topupCredits}},capabilities:providers.catalog()})
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff')
    const send=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value))}
    try{
      const path=new URL(req.url,'http://localhost').pathname
      if(req.method==='GET'&&path==='/health')return send(200,{ok:true,service:'iv-outreach-premium',local_test:!!config.localTest})
      if(req.method==='GET'&&path==='/billing/return'){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");res.end('<!doctype html><title>IV Outreach</title><body style="background:#100c0e;color:#f1ede5;font:18px system-ui;padding:10%"><h1>Return to IV Outreach</h1><p>Your balance updates after payment confirmation. In Settings, choose Refresh.</p><p>You can close this window.</p>');return}
      if(req.method==='GET'&&path==='/v1/config')return send(200,catalog())
      let raw=Buffer.alloc(0)
      for await(const chunk of req){if(raw.length+chunk.length>128*1024)fail('Request too large.',413);raw=Buffer.concat([raw,chunk])}
      if(path==='/v1/stripe/webhook'&&req.method==='POST')return send(200,await billing.webhook(raw,req.headers['stripe-signature']))
      if(req.headers.origin)fail('This endpoint requires the desktop client.',403)
      limit(`ip:${req.socket.remoteAddress}`,120,60000)
      let body={};try{body=raw.length?JSON.parse(raw.toString('utf8')):{}}catch{fail('Invalid JSON.',400)}
      if(!body||typeof body!=='object'||Array.isArray(body))fail('Expected an object.',400)
      if(path.startsWith('/v1/auth/')&&req.method==='POST'){
        limit(`auth-ip:${req.socket.remoteAddress}`,20,15*60000)
        if(path==='/v1/auth/start'){limit(`email:${String(body.email).toLowerCase()}`,3,15*60000);return send(200,await auth.start(body.email))}
        if(path==='/v1/auth/verify')return send(200,await auth.verify(body.email,body.code))
        if(path==='/v1/auth/refresh')return send(200,await auth.refresh(body.refresh_token))
      }
      const user=await auth.authenticate(req.headers.authorization);store.account(user);limit(`user:${user.id}`,120,60000)
      if(path==='/v1/account'&&req.method==='GET')return send(200,{...catalog(),...store.view(user.id)})
      if(path==='/v1/checkout'&&req.method==='POST')return send(200,await billing.checkout(user.id,body.kind))
      if(path==='/v1/portal'&&req.method==='POST')return send(200,await billing.portal(user.id))
      if(path==='/v1/quotes'&&req.method==='POST'){
        const items=normalize(body.capability,body.items)
        if(!providers.enabled(body.capability))fail('This paid capability is not available yet. Free research still works.',503)
        const spec=CATALOG[body.capability]
        return send(200,store.quote(user.id,body.capability,items,spec.credits,spec.cost))
      }
      if(path==='/v1/jobs'&&req.method==='POST'){
        const q=store.getQuote(user.id,body.quote_id)
        if(!q.job_id&&!providers.enabled(q.capability))fail('This paid capability is currently unavailable.',503)
        return send(200,publicJob(store.reserve(user.id,body.quote_id,body.max_credits,config.providerBudget)))
      }
      const match=path.match(/^\/v1\/jobs\/([a-f\d-]{36})(\/cancel)?$/)
      if(match&&req.method===(match[2]?'POST':'GET'))return send(200,publicJob(match[2]?store.cancel(user.id,match[1]):store.job(user.id,match[1])))
      fail('Not found.',404)
    }catch(e){send(e.status||500,{error:e.status?e.message:'The service could not complete this request. Please try again later.'})}
  })
  server.requestTimeout=20000;server.headersTimeout=10000
  const tick=worker(store,providers)
  return {server,tick,catalog}
}
export function publicJob(j){return {id:j.id,state:j.state,max_credits:j.credits,charged:j.charged,result:j.result,issue:j.issue,cancel_requested:!!j.cancel_requested,created:j.created,updated:j.updated}}
