import { fail } from './store.mjs'
export const CATALOG = {
  business_search:{label:'Discover local businesses',provider:'dataforseo',credits:3,cost:50000,description:'One search, up to 50 business listings. A completed search uses 3 credits even with no matches. Review candidates before adding leads.'},
  company_search:{label:'Research companies with AI search',provider:'exa',credits:2,cost:20000,description:'One search, up to 10 company pages. A completed search uses 2 credits even with no matches. No contact details or buying intent guaranteed.'},
  email_verify:{label:'Verify business emails',provider:'bouncer',credits:1,cost:10000,description:'Check existing addresses. Unknown results use no IV credits; verification is not a delivery guarantee.'},
  email_find:{label:'Find business emails',provider:'bettercontact',credits:5,cost:60000,description:'Find a work email for an already identified person. Only deliverable results use IV credits.'},
}
const text=(s,n=200)=>typeof s==='string'?s.trim().slice(0,n):''
const email=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254
export function normalize(capability,items){
  if(!Object.hasOwn(CATALOG,capability))fail('Unsupported paid capability.')
  if(!Array.isArray(items)||!items.length||items.length>25)fail('Choose 1–25 leads for a paid job.')
  if(['business_search','company_search'].includes(capability)&&items.length!==1)fail('Run one discovery search at a time.')
  const seen=new Set()
  return items.map(i=>{
    const client_ref=text(i.client_ref,100);if(!client_ref||seen.has(client_ref))fail('Each lead needs a unique reference.');seen.add(client_ref)
    if(capability==='company_search'){const query=text(i.query,500);if(query.length<5)fail('Describe the companies you want to find.');return {client_ref,query}}
    if(capability==='business_search'){
      const category=text(i.category,100),latitude=Number(i.latitude),longitude=Number(i.longitude),radius=Number(i.radius??10)
      if(!/^[a-z][a-z0-9_]{1,99}$/.test(category)||!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(radius)||radius<1||radius>50)fail('Choose a business category and valid map coordinates with a 1–50 km radius.')
      return {client_ref,category,latitude,longitude,radius}
    }
    if(capability==='email_verify'){const e=text(i.email,254).toLowerCase();if(!email(e))fail('An existing email is required for verification.');return {client_ref,email:e}}
    const first_name=text(i.first_name,80),last_name=text(i.last_name,80),domain=text(i.domain).toLowerCase()
    if(!first_name||!last_name||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain)||/\.(local|localhost|internal|test|invalid)$/.test(domain))fail('Email finding requires a real person’s first and last name and business domain.')
    return {client_ref,first_name,last_name,domain}
  })
}
export class Providers {
  constructor(config,fetcher=fetch){this.c=config;this.fetch=fetcher}
  enabled(cap){return !!(Object.hasOwn(CATALOG,cap)&&this.c.providersApproved&&this.c.providerBudget>0&&({email_verify:this.c.bouncerKey,email_find:this.c.betterContactKey,business_search:this.c.dataForSeoLogin&&this.c.dataForSeoPassword,company_search:this.c.exaKey}[cap]))}
  catalog(){return Object.entries(CATALOG).map(([id,v])=>({id,label:v.label,credits_per_result:v.credits,description:v.description,available:this.enabled(id)}))}
  async json(url,options){const r=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('Provider request did not return a confirmed result.');return r.json()}
  async step(store,job){
    const q=store.getQuote(job.user_id,job.quote_id),cap=q.capability,cp=job.checkpoint
    if(!this.enabled(cap)){if(cp)return store.review(job.user_id,job.id);return store.settle(job.user_id,job.id,0,[],'failed','This paid capability is not connected. Free research remains available.')}
    if(['business_search','company_search'].includes(cap)){
      if(cp?.inflight)return store.review(job.user_id,job.id)
      if(job.cancel_requested)return store.settle(job.user_id,job.id,0,[],'canceled')
      const item=q.items[0]
      store.checkpoint(job.id,{type:cap,inflight:true})
      const urlValue=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
      let rows
      if(cap==='company_search'){
        const data=await this.json('https://api.exa.ai/search',{method:'POST',headers:{'x-api-key':this.c.exaKey,'Content-Type':'application/json'},body:JSON.stringify({query:item.query,type:'auto',category:'company',numResults:10})})
        if(!Array.isArray(data.results))throw Error('Missing search results.')
        rows=data.results.slice(0,10).map(r=>({company:text(r.title),website:urlValue(r.url),source_url:urlValue(r.url),location:null,phone:null}))
      }else{
        const data=await this.json('https://api.dataforseo.com/v3/business_data/business_listings/search/live',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${this.c.dataForSeoLogin}:${this.c.dataForSeoPassword}`).toString('base64')}`,'Content-Type':'application/json'},body:JSON.stringify([{categories:[item.category],location_coordinate:`${item.latitude},${item.longitude},${item.radius}`,limit:50}])})
        const task=data.tasks?.[0];if(data.status_code!==20000||task?.status_code!==20000||!Array.isArray(task.result)||!task.result[0])throw Error('Unconfirmed business search.')
        const items=task.result[0].items??(task.result[0].total_count===0?[]:null);if(!Array.isArray(items))throw Error('Missing business listings.')
        rows=items.slice(0,50).map(r=>({company:text(r.title),website:urlValue(r.url),source_url:r.cid?`https://www.google.com/maps?cid=${encodeURIComponent(r.cid)}`:urlValue(r.url),location:text(r.address),phone:text(r.phone,60)}))
      }
      const seen=new Set(),results=rows.filter(r=>{const k=r.website||`${r.company}|${r.location}`;if(!r.company||(!r.website&&!r.source_url)||seen.has(k))return false;seen.add(k);return true}).map((r,i)=>({...r,client_ref:`${item.client_ref}:${i}`,provider:CATALOG[cap].provider,checked_at:new Date().toISOString(),status:'candidate',billable:false}))
      return store.settle(job.user_id,job.id,CATALOG[cap].credits,results,'complete')
    }
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
