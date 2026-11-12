import { fail } from './store.mjs'
export const CATALOG = {
  email_verify:{label:'Verify business emails',provider:'bouncer',credits:1,cost:10000,description:'Check existing addresses. Unknown results use no IV credits; verification is not a delivery guarantee.'},
  email_find:{label:'Find business emails',provider:'bettercontact',credits:5,cost:60000,description:'Find a work email for an already identified person. Only deliverable results use IV credits.'},
}
const text=(s,n=200)=>typeof s==='string'?s.trim().slice(0,n):''
const email=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254
export function normalize(capability,items){
  if(!Object.hasOwn(CATALOG,capability))fail('Unsupported paid capability.')
  if(!Array.isArray(items)||!items.length||items.length>25)fail('Choose 1–25 leads for a paid job.')
  const seen=new Set()
  return items.map(i=>{
    const client_ref=text(i.client_ref,100);if(!client_ref||seen.has(client_ref))fail('Each lead needs a unique reference.');seen.add(client_ref)
    if(capability==='email_verify'){const e=text(i.email,254).toLowerCase();if(!email(e))fail('An existing email is required for verification.');return {client_ref,email:e}}
    const first_name=text(i.first_name,80),last_name=text(i.last_name,80),domain=text(i.domain).toLowerCase()
    if(!first_name||!last_name||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain)||/\.(local|localhost|internal|test|invalid)$/.test(domain))fail('Email finding requires a real person’s first and last name and business domain.')
    return {client_ref,first_name,last_name,domain}
  })
}
export class Providers {
  constructor(config,fetcher=fetch){this.c=config;this.fetch=fetcher}
  enabled(cap){return this.c.providersApproved&&this.c.providerBudget>0&&!!(cap==='email_verify'?this.c.bouncerKey:this.c.betterContactKey)}
  catalog(){return Object.entries(CATALOG).map(([id,v])=>({id,label:v.label,credits_per_result:v.credits,description:v.description,available:this.enabled(id)}))}
  async json(url,options){const r=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('Provider request did not return a confirmed result.');return r.json()}
  async step(store,job){
    const q=store.getQuote(job.user_id,job.quote_id),cap=q.capability,cp=job.checkpoint
    if(!this.enabled(cap)){if(cp)return store.review(job.user_id,job.id);return store.settle(job.user_id,job.id,0,[],'failed','This paid capability is not connected. Free research remains available.')}
    if(cap==='email_verify'){
      if(cp?.inflight)return store.review(job.user_id,job.id)
      const results=cp?.results||[],next=cp?.next||0
      if(job.cancel_requested||next>=q.items.length)return store.settle(job.user_id,job.id,results.filter(r=>r.billable).length,results,job.cancel_requested?'canceled':'complete')
      const item=q.items[next]
      store.checkpoint(job.id,{type:'verify',next,results,inflight:true})
      const url=new URL('https://api.usebouncer.com/v1.1/email/verify');url.searchParams.set('email',item.email);url.searchParams.set('timeout','30')
      const data=await this.json(url,{headers:{'x-api-key':this.c.bouncerKey}})
      if(String(data.email).toLowerCase()!==item.email||!['deliverable','undeliverable','risky','unknown'].includes(data.status))throw new Error('Unexpected verification response.')
      results.push({client_ref:item.client_ref,email:item.email,status:data.status,billable:data.status!=='unknown',provider:'bouncer',checked_at:new Date().toISOString()})
      store.checkpoint(job.id,{type:'verify',next:next+1,results,inflight:false})
      store.db.prepare("update jobs set state='queued' where id=?").run(job.id)
    }else{
      if(cp?.inflight&&!cp.provider_id)return store.review(job.user_id,job.id)
      if(!cp?.provider_id){
        if(job.cancel_requested)return store.settle(job.user_id,job.id,0,[],'canceled')
        store.checkpoint(job.id,{type:'find',inflight:true})
        const data=await this.json('https://app.bettercontact.rocks/api/v2/async',{method:'POST',headers:{'X-API-Key':this.c.betterContactKey,'Content-Type':'application/json'},body:JSON.stringify({data:q.items.map(i=>({first_name:i.first_name,last_name:i.last_name,company_domain:i.domain,custom_fields:{client_ref:i.client_ref}})),enrich_email_address:true,enrich_phone_number:false,enrich_profile:false,verify_catch_all:false,timeout_seconds:240})})
        if(!data.success||typeof data.id!=='string'||!/^[\w-]{1,200}$/.test(data.id))throw new Error('Unconfirmed provider job.')
        store.checkpoint(job.id,{type:'find',provider_id:data.id,inflight:false})
        store.db.prepare("update jobs set state='queued' where id=?").run(job.id);return
      }
      const data=await this.json(`https://app.bettercontact.rocks/api/v2/async/${encodeURIComponent(cp.provider_id)}`,{headers:{'X-API-Key':this.c.betterContactKey}})
      if(data.status!=='terminated'){
        if(store.clock()-job.created>30*60e3)return store.review(job.user_id,job.id)
        store.db.prepare("update jobs set state='queued' where id=?").run(job.id);return
      }
      if(!Array.isArray(data.data))throw new Error('Missing provider results.')
      const rows=new Map()
      for(const row of data.data){const key=Array.isArray(row.custom_fields)?row.custom_fields.find(x=>x.name==='client_ref')?.value:row.custom_fields?.client_ref;if(rows.has(key)||!q.items.some(i=>i.client_ref===key))throw new Error('Provider references do not match.');rows.set(key,row)}
      const results=q.items.map(i=>{const row=rows.get(i.client_ref),e=text(row?.contact_email_address,254).toLowerCase(),valid=row?.contact_email_address_status==='deliverable'&&email(e);return {client_ref:i.client_ref,email:valid?e:null,status:valid?'deliverable':'not_found',billable:valid,provider:'bettercontact',checked_at:new Date().toISOString()}})
      return store.settle(job.user_id,job.id,results.filter(r=>r.billable).length*CATALOG.email_find.credits,results,'complete')
    }
  }
}
export function worker(store,providers){let busy=false;return async()=>{if(busy)return;busy=true;let job
  try{job=store.claim();if(job)await providers.step(store,job)}catch{if(job)store.review(job.user_id,job.id)}finally{busy=false}
}}
