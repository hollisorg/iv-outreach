import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
export const id = () => randomUUID()
export class Store {
  constructor(file, clock = () => Date.now()) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file); this.clock = clock
    this.db.exec(`pragma journal_mode=WAL; pragma foreign_keys=ON; pragma busy_timeout=5000;
      create table if not exists accounts(id text primary key,email text not null,customer text unique,subscription text,status text not null default 'free',paid_until integer not null default 0,blocked integer not null default 0);
      create table if not exists grants(id text primary key,user_id text not null references accounts(id),source text not null unique,amount integer not null check(amount>0),remaining integer not null check(remaining>=0),reserved integer not null default 0 check(reserved>=0 and reserved<=remaining),expires integer,created integer not null);
      create table if not exists ledger(id text primary key,user_id text not null references accounts(id),kind text not null,amount integer not null,reference text not null,created integer not null);
      create table if not exists quotes(id text primary key,user_id text not null references accounts(id),capability text not null,items text not null,credits integer not null,cost integer not null,expires integer not null,job_id text unique);
      create table if not exists jobs(id text primary key,user_id text not null references accounts(id),quote_id text not null unique references quotes(id),state text not null,credits integer not null,cost integer not null,charged integer not null default 0,result text not null default '[]',checkpoint text,issue text,cancel_requested integer not null default 0,created integer not null,updated integer not null);
      create table if not exists allocations(job_id text references jobs(id),grant_id text references grants(id),amount integer not null,primary key(job_id,grant_id));
      create table if not exists events(id text primary key,created integer not null);
      create table if not exists purchases(id text primary key,user_id text references accounts(id),kind text not null,session text unique,url text,state text not null default 'pending',created integer not null);
      create index if not exists grants_user on grants(user_id);
      create index if not exists jobs_user on jobs(user_id,created);
    `)
  }
  tx(fn) { this.db.exec('begin immediate'); try { const value = fn(); this.db.exec('commit'); return value } catch(e) { this.db.exec('rollback'); throw e } }
  account(user) { this.db.prepare('insert into accounts(id,email) values(?,?) on conflict(id) do update set email=excluded.email').run(user.id,user.email); return this.getAccount(user.id) }
  getAccount(uid) { return this.db.prepare('select * from accounts where id=?').get(uid) || fail('Account not found.',404) }
  active(uid) { const a=this.getAccount(uid); return !a.blocked && a.paid_until>this.clock() && ['active','canceled'].includes(a.status) }
  grant(uid, source, amount, expires = null) {
    if (!Number.isSafeInteger(amount)||amount<1) fail('Invalid credit grant.')
    const changed=this.db.prepare('insert or ignore into grants(id,user_id,source,amount,remaining,expires,created) values(?,?,?,?,?,?,?)').run(id(),uid,source,amount,amount,expires,this.clock()).changes
    if(changed)this.entry(uid,'grant',amount,source)
    return !!changed
  }
  entry(uid,kind,amount,reference) { this.db.prepare('insert into ledger values(?,?,?,?,?,?)').run(id(),uid,kind,amount,reference,this.clock()) }
  balance(uid) { return this.db.prepare('select coalesce(sum(remaining-reserved),0) available,coalesce(sum(reserved),0) reserved from grants where user_id=? and (expires is null or expires>?)').get(uid,this.clock()) }
  view(uid) {
    const a=this.getAccount(uid)
    return { email:a.email,status:a.blocked?'billing_review':a.status,premium:this.active(uid),paid_until:a.paid_until,...this.balance(uid),
      history:this.db.prepare('select kind,amount,reference,created from ledger where user_id=? order by created desc,rowid desc limit 50').all(uid),
      jobs:this.db.prepare('select id,state,credits,charged,issue,created,updated from jobs where user_id=? order by created desc limit 20').all(uid) }
  }
  quote(uid,capability,items,rate,cost) {
    if(!this.active(uid))fail('An active Premium subscription is required for paid data.',402)
    if(this.db.prepare('select count(*) n from quotes where user_id=? and expires>? and job_id is null').get(uid,this.clock()).n>=50)fail('Too many open quotes.',429)
    const q={id:id(),user_id:uid,capability,items,credits:items.length*rate,cost:items.length*cost,expires:this.clock()+10*60e3}
    this.db.prepare('insert into quotes(id,user_id,capability,items,credits,cost,expires) values(?,?,?,?,?,?,?)').run(q.id,uid,capability,JSON.stringify(items),q.credits,q.cost,q.expires)
    return {id:q.id,capability,count:items.length,max_credits:q.credits,expires:q.expires}
  }
  getQuote(uid,qid) { const q=this.db.prepare('select * from quotes where id=? and user_id=?').get(qid,uid); if(!q)fail('Quote not found.',404); return {...q,items:JSON.parse(q.items)} }
  reserve(uid,qid,maxCredits,budgetMicros) {
    return this.tx(()=>{
      const q=this.getQuote(uid,qid)
      if(q.job_id)return this.job(uid,q.job_id)
      if(!this.active(uid))fail('Premium is not active.',402)
      if(q.expires<=this.clock())fail('Quote expired. Request a new quote.',409)
      if(maxCredits!==q.credits)fail('Approve the exact quoted credit maximum.',409)
      if(this.db.prepare("select count(*) n from jobs where user_id=? and state in ('queued','running','review')").get(uid).n>=3)fail('Finish or cancel existing paid jobs first.',429)
      const month=new Date(this.clock()); month.setUTCDate(1); month.setUTCHours(0,0,0,0)
      const spent=this.db.prepare('select coalesce(sum(cost),0) n from jobs where created>=?').get(month.getTime()).n
      if(spent+q.cost>budgetMicros)fail('Paid research is at its service budget limit. Free research remains available.',503)
      const lots=this.db.prepare('select * from grants where user_id=? and remaining>reserved and (expires is null or expires>?) order by expires is null,expires,created').all(uid,this.clock())
      if(lots.reduce((n,g)=>n+g.remaining-g.reserved,0)<q.credits)fail('Not enough credits. Add credits or use free research.',402)
      const jid=id(),at=this.clock()
      this.db.prepare("insert into jobs(id,user_id,quote_id,state,credits,cost,created,updated) values(?,?,?,'queued',?,?,?,?)").run(jid,uid,qid,q.credits,q.cost,at,at)
      let left=q.credits
      for(const g of lots){if(!left)break; const amount=Math.min(left,g.remaining-g.reserved); this.db.prepare('update grants set reserved=reserved+? where id=?').run(amount,g.id); this.db.prepare('insert into allocations values(?,?,?)').run(jid,g.id,amount);left-=amount}
      this.db.prepare('update quotes set job_id=? where id=?').run(jid,qid);this.entry(uid,'reserve',-q.credits,jid)
      return this.job(uid,jid)
    })
  }
  job(uid,jid) { const j=this.db.prepare('select * from jobs where id=? and user_id=?').get(jid,uid);if(!j)fail('Job not found.',404); return {...j,result:JSON.parse(j.result),checkpoint:j.checkpoint?JSON.parse(j.checkpoint):null} }
  claim() { return this.tx(()=>{const j=this.db.prepare("select * from jobs where state='queued' order by created limit 1").get();if(!j)return null;this.db.prepare("update jobs set state='running',updated=? where id=?").run(this.clock(),j.id);return this.job(j.user_id,j.id)}) }
  checkpoint(jid,value){this.db.prepare('update jobs set checkpoint=?,updated=? where id=?').run(JSON.stringify(value),this.clock(),jid)}
  settle(uid,jid,charged,result,state='complete',issue=null){return this.tx(()=>{
    const j=this.job(uid,jid);if(!['queued','running','review'].includes(j.state))return j
    if(!Number.isSafeInteger(charged)||charged<0||charged>j.credits)fail('Invalid settlement.')
    let left=charged
    for(const a of this.db.prepare('select * from allocations where job_id=? order by rowid').all(jid)){const used=Math.min(left,a.amount);this.db.prepare('update grants set reserved=reserved-?,remaining=remaining-? where id=?').run(a.amount,used,a.grant_id);left-=used}
    this.entry(uid,'settle',-charged,jid);this.entry(uid,'release',j.credits-charged,jid)
    this.db.prepare('update jobs set state=?,charged=?,result=?,issue=?,updated=? where id=?').run(state,charged,JSON.stringify(result),issue,this.clock(),jid)
    return this.job(uid,jid)
  })}
  cancel(uid,jid){const j=this.job(uid,jid);if(j.state==='queued'&&!j.checkpoint){const done=this.settle(uid,jid,0,[],'canceled');this.db.prepare('update jobs set cost=0 where id=?').run(jid);return done}if(['queued','running','review'].includes(j.state))this.db.prepare('update jobs set cancel_requested=1 where id=?').run(jid);return this.job(uid,jid)}
  review(uid,jid){this.db.prepare("update jobs set state='review',issue='Provider outcome needs reconciliation; no automatic retry.',updated=? where id=? and user_id=? and state='running'").run(this.clock(),jid,uid)}
  recover(){this.db.prepare("update jobs set state=case when checkpoint is not null then 'queued' else 'review' end,issue='Recovered after restart; provider request will not be submitted twice.' where state='running'").run()}
  close(){this.db.close()}
}
