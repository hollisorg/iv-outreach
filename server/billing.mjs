import Stripe from 'stripe'
import { fail,id } from './store.mjs'
const ref=v=>typeof v==='string'?v:v?.id
const priceOf=l=>ref(l.price)||l.pricing?.price_details?.price
export class Billing {
  constructor(store,config,stripe=null){this.store=store;this.c=config;this.stripe=stripe||(config.stripeKey?new Stripe(config.stripeKey,{maxNetworkRetries:1,timeout:15000}):null)}
  async validate(){
    if(!this.stripe)return false
    const account=await this.stripe.accounts.retrieve()
    if(!this.c.account||account.id!==this.c.account)throw new Error('Stripe account does not match configured account.')
    for(const [key,cents,kind] of [[this.c.premiumPrice,this.c.premiumCents,'subscription'],[this.c.topupPrice,this.c.topupCents,'payment']]){
      const p=await this.stripe.prices.retrieve(key)
      if(p.livemode!==this.c.live||!p.active||p.unit_amount!==cents||p.currency!=='usd'||(kind==='subscription'?(p.recurring?.interval!=='month'||p.recurring?.interval_count!==1):!!p.recurring))throw new Error('Stripe price does not match the published catalog.')
    }
    return true
  }
  async customer(uid){const a=this.store.getAccount(uid);if(a.customer)return a.customer
    const c=await this.stripe.customers.create({email:a.email,metadata:{app:'iv_outreach',user_id:uid}},{idempotencyKey:`iv-customer-${uid}`})
    this.store.db.prepare('update accounts set customer=? where id=? and customer is null').run(c.id,uid);return this.store.getAccount(uid).customer
  }
  async checkout(uid,kind){
    if(!this.stripe||!this.c.webhookSecret)fail('Billing is not connected yet.',503)
    if(!['premium','topup'].includes(kind))fail('Choose a supported plan.')
    if(kind==='premium'&&this.store.active(uid))fail('You already have Premium. Use Manage subscription.',409)
    const account=this.store.getAccount(uid)
    if(kind==='premium'&&account.subscription&&!['canceled','incomplete_expired'].includes(account.status))fail('An existing subscription needs attention. Use Manage subscription.',409)
    if(kind==='topup'&&!this.store.active(uid))fail('Subscribe before adding Premium credits.',402)
    const customer=await this.customer(uid),now=this.store.clock()
    const p=this.store.tx(()=>{
      const old=this.store.db.prepare("select * from purchases where user_id=? and kind=? and state='pending' and created>? order by created desc limit 1").get(uid,kind,now-35*60e3)
      if(old)return old
      const pid=id();this.store.db.prepare('insert into purchases(id,user_id,kind,created) values(?,?,?,?)').run(pid,uid,kind,now);return {id:pid,created:now}
    })
    if(p.url)return {url:p.url,test_mode:!this.c.live}
    const metadata={app:'iv_outreach',user_id:uid,purchase_id:p.id,kind}
    const session=await this.stripe.checkout.sessions.create({mode:kind==='premium'?'subscription':'payment',customer,
      client_reference_id:uid,metadata,line_items:[{price:kind==='premium'?this.c.premiumPrice:this.c.topupPrice,quantity:1}],
      integration_identifier:'iv_outreach_local_qxrmnvpa',allow_promotion_codes:false,expires_at:Math.floor(p.created/1000)+35*60,
      ...(kind==='premium'?{subscription_data:{metadata,billing_mode:{type:'flexible'}}}:{payment_intent_data:{metadata}}),
      success_url:`${this.c.origin}/billing/return`,cancel_url:`${this.c.origin}/billing/return?canceled=1`,
    },{idempotencyKey:`iv-checkout-${p.id}`})
    this.store.db.prepare('update purchases set session=?,url=? where id=?').run(session.id,session.url,p.id)
    return {url:session.url,test_mode:!this.c.live}
  }
  async portal(uid){if(!this.stripe)fail('Billing is not connected yet.',503);const a=this.store.getAccount(uid);if(!a.customer)fail('No billing account yet.')
    const s=await this.stripe.billingPortal.sessions.create({customer:a.customer,...(this.c.portalConfig?{configuration:this.c.portalConfig}:{}),return_url:`${this.c.origin}/billing/return`});return {url:s.url}
  }
  async webhook(raw,signature){if(!this.stripe||!this.c.webhookSecret)fail('Billing webhook is not configured.',503)
    let event;try{event=this.stripe.webhooks.constructEvent(raw,signature,this.c.webhookSecret)}catch{fail('Invalid webhook signature.',400)}
    if(event.livemode!==this.c.live)fail('Wrong billing mode.',400)
    return this.event(event)
  }
  async event(event){
    if(this.store.db.prepare('select 1 from events where id=?').get(event.id))return {received:true}
    const obj=event.data.object;let apply=()=>{}
    if(['invoice.paid','invoice.payment_failed'].includes(event.type)){
      const invoice=await this.stripe.invoices.retrieve(obj.id)
      const sid=ref(invoice.parent?.subscription_details?.subscription)||ref(invoice.subscription)
      if(sid){
        const s=await this.stripe.subscriptions.retrieve(sid)
        const a=this.accountFor(s)
        if(a){
          const lines=invoice.lines?.data||[]
          const line=lines.find(l=>priceOf(l)===this.c.premiumPrice&&l.quantity===1&&!(l.proration||l.parent?.subscription_item_details?.proration))
          const expiry=Number(line?.period?.end)*1000
          const paid=invoice.status==='paid'&&invoice.paid!==false&&['subscription_create','subscription_cycle'].includes(invoice.billing_reason)&&line&&Number.isSafeInteger(expiry)&&expiry>0
          apply=()=>{
            this.sync(a.id,s)
            if(event.type==='invoice.paid'&&paid){
              this.store.grant(a.id,`invoice:${invoice.id}`,this.c.premiumCredits,expiry)
              this.store.db.prepare('update accounts set paid_until=max(paid_until,?) where id=?').run(expiry,a.id)
            }
          }
        }
      }
    }else if(['customer.subscription.updated','customer.subscription.deleted','customer.subscription.created'].includes(event.type)){
      const s=await this.stripe.subscriptions.retrieve(obj.id),a=this.accountFor(s)
      if(a)apply=()=>this.sync(a.id,s)
    }else if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
      const session=await this.stripe.checkout.sessions.retrieve(obj.id,{expand:['line_items']})
      const p=this.store.db.prepare('select * from purchases where id=?').get(session.metadata?.purchase_id||'')
      if(p&&ref(session.customer)===this.store.getAccount(p.user_id).customer&&session.metadata?.app==='iv_outreach'&&session.metadata.user_id===p.user_id){
        const lines=session.line_items?.data||[]
        const valid=session.payment_status==='paid'&&session.mode==='payment'&&p.kind==='topup'&&lines.length===1&&ref(lines[0].price)===this.c.topupPrice&&lines[0].quantity===1&&session.amount_total===this.c.topupCents&&session.currency==='usd'
        apply=()=>{if(valid)this.store.grant(p.user_id,`checkout:${session.id}`,this.c.topupCredits);this.store.db.prepare("update purchases set state='complete',session=? where id=?").run(session.id,p.id)}
      }
    }else if(['charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'].includes(event.type)){
      const charge=event.type==='charge.refunded'?obj:await this.stripe.charges.retrieve(ref(obj.charge))
      const a=this.store.db.prepare('select * from accounts where customer=?').get(ref(charge.customer)||'')
      if(a)apply=()=>this.store.db.prepare('update accounts set blocked=1 where id=?').run(a.id)
    }
    this.store.tx(()=>{if(this.store.db.prepare('select 1 from events where id=?').get(event.id))return;apply();this.store.db.prepare('insert into events values(?,?)').run(event.id,this.store.clock())})
    return {received:true}
  }
  accountFor(s){if(s.metadata?.app!=='iv_outreach'||!s.items?.data?.some(i=>ref(i.price)===this.c.premiumPrice&&i.quantity===1))return null
    const a=this.store.db.prepare('select * from accounts where id=? and customer=?').get(s.metadata.user_id||'',ref(s.customer)||'');if(a?.subscription&&a.subscription!==s.id&&a.paid_until>this.store.clock())return null;return a
  }
  sync(uid,s){this.store.db.prepare('update accounts set subscription=?,status=? where id=?').run(s.id,s.status,uid)}
}
