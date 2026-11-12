import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import Stripe from '../server/node_modules/stripe/esm/stripe.esm.node.js'
import {Store} from '../server/store.mjs'
import {Billing} from '../server/billing.mjs'
import {Providers,normalize,worker} from '../server/providers.mjs'
import {createApp} from '../server/app.mjs'
import {config} from '../server/config.mjs'
import {Auth} from '../server/auth.mjs'
import {PremiumClient,startPremiumBridge,premiumBridge} from '../src/service/premium.js'

const item={client_ref:'lead-a',email:'contact@example.com'}
function fixture(){let clock=Date.now();const s=new Store(':memory:',()=>clock);s.account({id:'u1',email:'one@example.com'});s.account({id:'u2',email:'two@example.com'});s.db.prepare("update accounts set status='active',paid_until=?").run(clock+86400000);return {s,advance:n=>clock+=n,q:(n=1,uid='u1')=>s.quote(uid,'email_verify',Array.from({length:n},(_,i)=>({...item,client_ref:`lead-${i}`})),1,10000)}}

test('credits reserve atomically, exact approval, single settlement, ownership and expiry',()=>{
 const {s,q,advance}=fixture();try{
  s.grant('u1','monthly',5,s.clock()+1000);s.grant('u1','topup',3)
  assert.equal(s.grant('u1','monthly',5),false)
  const quote=q(5);assert.throws(()=>s.reserve('u1',quote.id,4,1e6),/exact/)
  assert.throws(()=>s.reserve('u2',quote.id,5,1e6),/not found/)
  const j=s.reserve('u1',quote.id,5,1e6);assert.equal(s.reserve('u1',quote.id,5,1e6).id,j.id)
  assert.equal(s.balance('u1').available,3);assert.throws(()=>s.reserve('u1',q(4).id,4,1e6),/Not enough/)
  advance(2000);s.settle('u1',j.id,2,[item]);s.settle('u1',j.id,5,[])
  assert.equal(s.balance('u1').available,3);assert.equal(s.job('u1',j.id).charged,2)
  assert.throws(()=>s.job('u2',j.id),/not found/)
  const expired=q();advance(11*60000);assert.throws(()=>s.reserve('u1',expired.id,1,1e6),/expired/)
 }finally{s.close()}
})
test('separate database connections cannot overspend the same grants',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'iv-ledger-')),'db.sqlite'),a=new Store(path),b=new Store(path)
 try{a.account({id:'u',email:'test@example.com'});a.db.prepare("update accounts set status='active',paid_until=?").run(Date.now()+86400000);a.grant('u','grant',1)
 const q1=a.quote('u','email_verify',[item],1,10000),q2=b.quote('u','email_verify',[item],1,10000)
 a.reserve('u',q1.id,1,1e6);assert.throws(()=>b.reserve('u',q2.id,1,1e6),/Not enough/)
 assert.equal(b.balance('u').available,0)
 }finally{a.close();b.close()}
})
test('canceling queued work releases holds; submitted provider work is retained for settlement',()=>{
 const {s,q}=fixture();try{s.grant('u1','grant',10);const j=s.reserve('u1',q(2).id,2,1e6);s.cancel('u1',j.id);assert.equal(s.balance('u1').available,10)
 const started=s.reserve('u1',q(2).id,2,1e6);s.checkpoint(started.id,{type:'verify',results:[{...item,billable:true}],next:1,inflight:false});s.cancel('u1',started.id)
 assert.equal(s.job('u1',started.id).cancel_requested,1);assert.equal(s.balance('u1').available,8)
 s.settle('u1',started.id,1,[item],'canceled');assert.equal(s.balance('u1').available,9)
 assert.throws(()=>s.reserve('u1',q().id,1,0),/budget limit/)
 s.db.prepare('update accounts set blocked=1 where id=?').run('u1');assert.throws(()=>q(),/active/)
 }finally{s.close()}
})
function billingFixture(){const f=fixture(),c={...config({}),premiumPrice:'price_month',topupPrice:'price_top',webhookSecret:'whsec_fictional_fixture',account:'acct_fixture'}
 f.s.db.prepare('update accounts set customer=? where id=?').run('cus_fixture','u1')
 const sub={id:'sub_fixture',customer:'cus_fixture',metadata:{app:'iv_outreach',user_id:'u1'},status:'active',items:{data:[{price:{id:c.premiumPrice},quantity:1}]}}
 const invoice={id:'in_fixture',parent:{subscription_details:{subscription:'sub_fixture'}},status:'paid',paid:true,billing_reason:'subscription_cycle',lines:{data:[{pricing:{price_details:{price:c.premiumPrice}},quantity:1,parent:{subscription_item_details:{proration:false}},period:{end:Math.floor(f.s.clock()/1000)+3600}}]}}
 const sessions=new Map(),created=[];const sdk=new Stripe('sk_test_fictional_fixture')
 const stripe={webhooks:sdk.webhooks,accounts:{retrieve:async()=>({id:c.account})},prices:{retrieve:async p=>({active:true,livemode:false,currency:'usd',unit_amount:p===c.premiumPrice?4900:1000,recurring:p===c.premiumPrice?{interval:'month',interval_count:1}:null})},invoices:{retrieve:async()=>invoice},subscriptions:{retrieve:async()=>sub},checkout:{sessions:{retrieve:async id=>sessions.get(id),create:async(body,options)=>{created.push({body,options});const session={id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture',...body};sessions.set(session.id,session);return session}}},billingPortal:{sessions:{create:async()=>({url:'https://billing.stripe.com/p/session/fixture'})}}}
 const b=new Billing(f.s,c,stripe),event=(id,type,obj)=>({id,type,livemode:false,data:{object:obj}})
 const signed=e=>{const raw=JSON.stringify(e);return b.webhook(Buffer.from(raw),sdk.webhooks.generateTestHeaderString({payload:raw,secret:c.webhookSecret}))}
 return {...f,c,sub,invoice,sessions,created,b,event,signed}
}
test('signed Stripe invoices grant once; invalid signatures/modes/prices do not mint credits',async()=>{
 const f=billingFixture();try{
 await f.b.validate();await assert.rejects(()=>f.b.webhook(Buffer.from('{}'),'invalid'),/signature/)
 await assert.rejects(()=>f.signed({...f.event('bad','invoice.paid',f.invoice),livemode:true}),/mode/)
 await f.signed(f.event('evt_paid','invoice.paid',f.invoice));await f.signed(f.event('evt_paid','invoice.paid',f.invoice));await f.signed(f.event('evt_duplicate_invoice','invoice.paid',f.invoice));assert.equal(f.s.balance('u1').available,500)
 f.invoice.id='in_wrong';f.invoice.lines.data[0].pricing.price_details.price='other';await f.signed(f.event('evt_wrong','invoice.paid',f.invoice));assert.equal(f.s.balance('u1').available,500)
 f.invoice.lines.data[0].pricing.price_details.price=f.c.premiumPrice;f.invoice.status='open';await f.signed(f.event('evt_unpaid','invoice.paid',f.invoice));assert.equal(f.s.balance('u1').available,500)
 f.sub.status='past_due';await f.signed(f.event('evt_stale_active','customer.subscription.updated',{...f.sub,status:'active'}));assert.equal(f.s.active('u1'),false)
 }finally{f.s.close()}
})
test('checkout is fixed-price, reusable, bound to customer; topups need confirmed payment',async()=>{
 const f=billingFixture();try{
 const first=await f.b.checkout('u1','topup');assert.deepEqual(await f.b.checkout('u1','topup'),first);assert.equal(f.created.length,1);assert.deepEqual(f.created[0].body.line_items,[{price:f.c.topupPrice,quantity:1}])
 const session=f.sessions.get('cs_fixture');Object.assign(session,{line_items:{data:[{price:{id:f.c.topupPrice},quantity:1}]},amount_total:1000,currency:'usd',payment_status:'unpaid'})
 await f.signed(f.event('evt_pending','checkout.session.completed',session));assert.equal(f.s.balance('u1').available,0)
 session.payment_status='paid';session.customer='wrong_customer';await f.signed(f.event('evt_wrong_customer','checkout.session.async_payment_succeeded',session));assert.equal(f.s.balance('u1').available,0)
 session.customer='cus_fixture';await f.signed(f.event('evt_paid','checkout.session.async_payment_succeeded',session));await f.signed(f.event('evt_paid_again','checkout.session.completed',session));assert.equal(f.s.balance('u1').available,100)
 await assert.rejects(()=>f.b.checkout('u1','client_price'),/supported/)
 await f.signed(f.event('evt_refund','charge.refunded',{customer:'cus_fixture'}));assert.equal(f.s.active('u1'),false)
 }finally{f.s.close()}
})
test('verification charges known results only; cancellation settles completed items',async()=>{
 const {s,q}=fixture();try{s.grant('u1','grant',20);const c={providersApproved:true,providerBudget:1e6,bouncerKey:'fixture'};let requests=0
 const p=new Providers(c,async()=>({ok:true,json:async()=>({email:item.email,status:++requests===1?'unknown':'deliverable'})})),tick=worker(s,p)
 const j=s.reserve('u1',q(2).id,2,1e6);await tick();await tick();await tick();assert.equal(s.job('u1',j.id).charged,1);assert.equal(s.balance('u1').available,19)
 const cancel=s.reserve('u1',q(2).id,2,1e6);await tick();s.cancel('u1',cancel.id);await tick();assert.equal(requests,3);assert.equal(s.job('u1',cancel.id).state,'canceled');assert.equal(s.job('u1',cancel.id).charged,1)
 }finally{s.close()}
})
test('uncertain provider submission is held for review, never retried after restart',async()=>{
 const {s,q}=fixture();try{s.grant('u1','grant',5);const j=s.reserve('u1',q().id,1,1e6);s.claim();s.checkpoint(j.id,{type:'verify',inflight:true});s.recover();let calls=0
 const p=new Providers({providersApproved:true,providerBudget:1e6,bouncerKey:'fixture'},async()=>{calls++;throw Error('network')});await worker(s,p)();assert.equal(calls,0);assert.equal(s.job('u1',j.id).state,'review');assert.equal(s.balance('u1').reserved,1)
 }finally{s.close()}
})
test('BetterContact async submission happens once and result references are matched',async()=>{
 const {s}=fixture();try{s.grant('u1','grant',10);const items=normalize('email_find',[{client_ref:'a',first_name:'Alex',last_name:'Example',domain:'example.com'},{client_ref:'b',first_name:'Sam',last_name:'Example',domain:'example.org'}]);const q=s.quote('u1','email_find',items,5,60000),j=s.reserve('u1',q.id,10,1e6);let posts=0,gets=0
 const p=new Providers({providersApproved:true,providerBudget:1e6,betterContactKey:'fixture'},async(url,opts)=>{if(opts.method==='POST'){posts++;assert.equal(JSON.parse(opts.body).enrich_phone_number,false);return {ok:true,json:async()=>({success:true,id:'req_fixture'})}}gets++;return {ok:true,json:async()=>({status:'terminated',data:[{custom_fields:[{name:'client_ref',value:'b'}],contact_email_address:'sam@example.org',contact_email_address_status:'deliverable'},{custom_fields:[{name:'client_ref',value:'a'}],contact_email_address_status:'not_found'}]})}})
 const tick=worker(s,p);await tick();s.cancel('u1',j.id);assert.equal(s.balance('u1').reserved,10);await tick();await tick();assert.equal(posts,1);assert.equal(gets,1);assert.equal(s.job('u1',j.id).charged,5);assert.equal(s.job('u1',j.id).result[1].client_ref,'b')
 }finally{s.close()}
})
test('HTTP service enforces auth, cross-account isolation and server credit caps',async()=>{
 const {s}=fixture();s.grant('u1','grant',5)
 const auth={authenticate:async h=>{if(!['Bearer u1','Bearer u2'].includes(h))throw Object.assign(Error('Sign in'),{status:401});return {id:h.slice(7),email:h.slice(7)+'@example.com'}}}
 const c={...config({}),providerBudget:1e6},providers=new Providers({...c,providersApproved:true,bouncerKey:'fixture'})
 const app=createApp({store:s,config:c,billing:{stripe:null},auth,providers});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`
 const req=(path,body,token='u1')=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
 try{assert.equal((await req('/v1/account',null,'bad')).status,401);const quote=await(await req('/v1/quotes',{capability:'email_verify',items:[item]})).json();assert.equal((await req('/v1/jobs',{quote_id:quote.id,max_credits:0})).status,409)
 const job=await(await req('/v1/jobs',{quote_id:quote.id,max_credits:1})).json();assert.equal(job.state,'queued');assert.equal((await req(`/v1/jobs/${job.id}`,null,'u2')).status,404);assert.equal((await req(`/v1/jobs/${job.id}/cancel`,{},'u2')).status,404)
 assert.equal((await(await req('/v1/account')).json()).available,4);assert.equal((await req('/v1/credits',{amount:100000})).status,404)
 }finally{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));s.close()}
})
test('desktop session refresh is shared and bridge requires secret; free mode stays usable',async()=>{
 let session={access_token:'old',refresh_token:'refresh_fixture',expires_at:0},refreshes=0;const c=new PremiumClient({base:'http://127.0.0.1:12345',readSession:()=>session,writeSession:v=>session=v,fetcher:async(url,opts)=>{if(url.endsWith('/refresh')){refreshes++;await new Promise(r=>setTimeout(r,10));return {ok:true,json:async()=>({access_token:'new',refresh_token:'new_refresh',expires_at:Date.now()/1000+3600})}}assert.equal(opts.headers.Authorization,'Bearer new');return {ok:true,json:async()=>({ok:true})}}})
 await Promise.all([c.request('/v1/account'),c.request('/v1/account')]);assert.equal(refreshes,1)
 assert.equal((await new PremiumClient({base:'',readSession:()=>null,writeSession:()=>{}}).status()).configured,false)
 const dir=mkdtempSync(join(tmpdir(),'iv-bridge-')),bridge=await startPremiumBridge(dir,{status:()=>({available:5})});try{assert.equal((await premiumBridge(dir,'status')).available,5);await assert.rejects(()=>premiumBridge(dir,'run'),/Unknown/)}finally{bridge.close()}
 assert.throws(()=>new PremiumClient({base:'http://remote.example',readSession:()=>null,writeSession:()=>{}}),/Invalid/)
})
test('auth verifies users remotely and refuses unverified or anonymous accounts',async()=>{
 const c={supabaseUrl:'https://auth.example',supabaseKey:'public_fixture'};let user={id:'u',email:'u@example.com',email_confirmed_at:'now',is_anonymous:false}
 const a=new Auth(c,async()=>({ok:true,json:async()=>user}));assert.equal((await a.authenticate('Bearer '+ 'x'.repeat(30))).id,'u');user.is_anonymous=true;await assert.rejects(()=>a.authenticate('Bearer '+'x'.repeat(30)),/verified/);await assert.rejects(()=>a.authenticate('Bearer arbitrary'),/Sign in/)
 assert.throws(()=>config({STRIPE_SECRET_KEY:'sk_live_fixture'}),/mode/)
})
