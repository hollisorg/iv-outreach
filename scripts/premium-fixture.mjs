// Isolated test/demo server only. No outbound network, Stripe checkout, real users or real provider data.
import {randomBytes} from 'node:crypto'
import {Store,fail} from '../server/store.mjs'
import {config} from '../server/config.mjs'
import {createApp} from '../server/app.mjs'
import {CATALOG} from '../server/providers.mjs'
export async function premiumFixture(){
 const store=new Store(':memory:'),c={...config({}),providerBudget:1e6},token=randomBytes(24).toString('hex')
 const user={id:'fictional-demo',email:'demo@iv-outreach.test'}
 store.account(user);store.db.prepare("update accounts set status='active',paid_until=? where id=?").run(Date.now()+30*86400000,user.id);store.grant(user.id,'fictional-demo',500,Date.now()+30*86400000)
 const session=()=>({access_token:token,refresh_token:token,expires_at:Date.now()/1000+3600,email:user.email})
 const auth={start:async email=>{if(email!==user.email)fail('Use demo@iv-outreach.test in this isolated demo.');return {sent:true}},verify:async(email,code)=>{if(email!==user.email||code!=='123456')fail('Demo code is 123456.');return session()},refresh:async t=>{if(t!==token)fail('Invalid demo session.',401);return session()},authenticate:async h=>{if(h!==`Bearer ${token}`)fail('Sign in.',401);return user}}
 const providers={enabled:cap=>Object.hasOwn(CATALOG,cap),catalog:()=>Object.entries(CATALOG).map(([id,v])=>({id,label:v.label,description:v.description,credits_per_result:v.credits,available:true})),step:async(s,j)=>{const q=s.getQuote(j.user_id,j.quote_id);await new Promise(r=>setTimeout(r,250));const results=['company_search','business_search'].includes(q.capability)?[{client_ref:'demo-candidate',company:'Fictional Growth Business',website:'https://fictional-growth.test/',source_url:'https://fictional-growth.test/',location:'Demo City',provider:'FICTIONAL DEMO',status:'candidate',checked_at:new Date().toISOString()}]:q.items.map(i=>({client_ref:i.client_ref,email:i.email||'alex@example.test',status:'deliverable',provider:'FICTIONAL DEMO',checked_at:new Date().toISOString(),billable:true}));s.settle(j.user_id,j.id,q.credits,results)}}
 const app=createApp({store,config:c,billing:{stripe:null,checkout:async()=>fail('No purchases in the demo.'),portal:async()=>fail('No purchases in the demo.')},auth,providers,demo:true})
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const timer=setInterval(app.tick,300)
 return {store,url:`http://127.0.0.1:${app.server.address().port}`,close:async()=>{clearInterval(timer);app.server.closeAllConnections();await new Promise(r=>app.server.close(r));store.close()}}
}
