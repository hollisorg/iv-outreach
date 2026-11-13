// Private local test service. Reads only the dedicated CLI test credential, never its live key.
import {spawn} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'
import Stripe from 'stripe'
import {Store} from './store.mjs'
import {Billing} from './billing.mjs'
import {config} from './config.mjs'
import {LocalTestAuth} from './local-auth.mjs'
import {Providers} from './providers.mjs'
import {createApp} from './app.mjs'
import {readTestProfile} from './cli-profile.mjs'
const root=join(process.env.APPDATA||join(homedir(),'.config'),'IVOutreachPremiumTest')
mkdirSync(root,{recursive:true});const statusFile=join(root,'status.json'),identityFile=join(root,'device.secret.json')
const status=value=>{writeFileSync(statusFile+'.tmp',JSON.stringify({at:new Date().toISOString(),...value}));renameSync(statusFile+'.tmp',statusFile)}
let cli,service,timer,store,stopping=false,stage='profile'
function stop(reason='stopped'){if(stopping)return;stopping=true;clearInterval(timer);status({ready:false,reason});cli?.kill();service?.closeAllConnections();service?.close(()=>{store?.close();process.exit(0)});setTimeout(()=>process.exit(0),1000).unref()}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop())
try{
 const health=await fetch('http://127.0.0.1:4319/health',{signal:AbortSignal.timeout(1500)}).then(r=>r.json()).catch(()=>null)
 if(health?.service==='iv-outreach-premium'&&health.local_test){console.log('IV Outreach local test backend is already running.');process.exit(0)}
 const profile=readTestProfile(),stripe=new Stripe(profile.key,{maxNetworkRetries:1,timeout:15000})
 stage='account';if((await stripe.accounts.retrieve()).id!==profile.account)throw Error('Account mismatch')
 const device=existsSync(identityFile)?JSON.parse(readFileSync(identityFile,'utf8')):{token:randomBytes(32).toString('hex'),user_id:randomUUID()}
 if(!existsSync(identityFile))writeFileSync(identityFile,JSON.stringify(device),{mode:0o600})
 stage='webhook';const events='invoice.paid,invoice.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,checkout.session.async_payment_succeeded,charge.refunded,charge.dispute.created,radar.early_fraud_warning.created'
 cli=spawn(process.env.IV_STRIPE_CLI||'stripe',['listen','--project-name','iv-outreach-test','--skip-update','--latest','--events',events,'--forward-to','http://127.0.0.1:4319/v1/stripe/webhook'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
 let stream=''
 const secret=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Webhook forwarding did not start.')),30000)
  const consume=chunk=>{stream=(stream+chunk.toString()).slice(-8000);const m=stream.match(/whsec_[A-Za-z0-9]+/);if(m){clearTimeout(timeout);resolve(m[0])}}
  cli.stdout.on('data',consume);cli.stderr.on('data',consume);cli.once('error',()=>{clearTimeout(timeout);reject(Error('Stripe CLI unavailable.'))});cli.once('exit',()=>{clearTimeout(timeout);reject(Error('Stripe CLI closed.'))})
 })
 stream='';cli.stdout.removeAllListeners('data');cli.stderr.removeAllListeners('data');cli.stdout.on('data',()=>{});cli.stderr.on('data',()=>{});cli.once('exit',()=>stop('Stripe forwarding stopped. Restart the local test backend.'))
 // Dedicated portal configuration; no edits to the account's default portal or live settings.
 stage='portal';let portalId=existsSync(join(root,'portal.json'))?JSON.parse(readFileSync(join(root,'portal.json'),'utf8')).id:null
 if(!portalId){const portal=await stripe.billingPortal.configurations.create({business_profile:{headline:'IV Outreach — test subscription management'},features:{customer_update:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'}},metadata:{app:'iv_outreach',purpose:'local_test'}},{idempotencyKey:'iv-outreach-local-test-portal-v2'});portalId=portal.id;writeFileSync(join(root,'portal.json'),JSON.stringify({id:portalId}))}
 const providerEnvironment=Object.fromEntries(['IV_PROVIDER_MONTHLY_BUDGET_MICROS','IV_PROVIDER_CONTRACTS_APPROVED','BOUNCER_API_KEY','BETTERCONTACT_API_KEY','DATAFORSEO_LOGIN','DATAFORSEO_PASSWORD','EXA_API_KEY'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
 stage='catalog';const c=config({...providerEnvironment,IV_LOCAL_TEST:'true',STRIPE_SECRET_KEY:profile.key,STRIPE_WEBHOOK_SECRET:secret,STRIPE_ACCOUNT_ID:profile.account,STRIPE_PREMIUM_PRICE_ID:'price_1Ub4F7ADnzKPQPbvov3vsOZD',STRIPE_TOPUP_PRICE_ID:'price_1Ub4FBADnzKPQPbvhV2qIes9',STRIPE_PORTAL_CONFIG_ID:portalId,IV_BILLING_DB:join(root,'premium.db')})
 store=new Store(c.database);const billing=new Billing(store,c,stripe);await billing.validate();store.recover()
 const app=createApp({store,config:c,billing,auth:new LocalTestAuth(c,device),providers:new Providers(c)})
 stage='listen';service=app.server;await new Promise((resolve,reject)=>{service.once('error',reject);service.listen(c.port,c.host,resolve)})
 writeFileSync(join(root,'connection.json'),JSON.stringify({url:c.origin,token:device.token}),{mode:0o600})
 timer=setInterval(()=>app.tick(),2000)
 status({ready:true,account:profile.account,test_mode:true,local_only:true,pid:process.pid,port:c.port,providers_enabled:new Providers(c).catalog().some(x=>x.available)})
 console.log('IV Outreach local TEST backend ready on 127.0.0.1:4319. Provider availability is shown in Settings. Stripe test mode does not make provider calls free.')
}catch(e){status({ready:false,stage,error_type:/^[A-Za-z]+$/.test(e.type||'')?e.type:null,parameter:/^[a-z_\[\]]+$/.test(e.param||'')?e.param:null,reason:'Local test setup failed. Check the dedicated Stripe login and local port, then restart.'});cli?.kill();store?.close();console.error('Local test setup failed. No credentials logged.');process.exit(1)}
