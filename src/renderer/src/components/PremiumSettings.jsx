import { useState } from 'react'
import { call,useData,when } from '../api'
export default function PremiumSettings({notify}){
  const [s,reload,error]=useData('premiumStatus'),[email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false)
  const act=fn=>async()=>{setBusy(true);try{await fn();reload()}catch(e){notify(e.message)}finally{setBusy(false)}}
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100)
  return <section className="panel set premium-settings" aria-label="IV Outreach Premium">
    <div className="set-head"><p className="eyebrow">Optional upgrade</p><h2>More reach. One balance.</h2><p className="small dim">Keep finding leads with your own Claude Code or Codex for free. Premium adds paid contact data when you choose it.</p></div>
    {error&&<p role="alert">{error}</p>}
    {!s&&!error&&<p>Checking Premium…</p>}
    {s&&!s.configured&&<p className="premium-notice">Premium is being prepared. Your free tools are ready to use; subscriptions and paid searches are not connected in this build.</p>}
    {s?.configured&&<>
      {(s.test_mode||s.demo)&&<p className="premium-notice">{s.demo?'DEMO · Fictional account and results. No purchases or provider calls.':'TEST MODE · Test payments only. No real charges.'}</p>}
      <div className="premium-plans"><div><strong>{money(s.plans.premium.amount)}<span className="small dim"> / month</span></strong><p>{s.plans.premium.credits} credits each billing month</p></div><div><strong>{money(s.plans.topup.amount)}</strong><p>{s.plans.topup.credits} extra credits</p></div></div>
      <p className="small dim">Monthly credits expire at the end of the billing period. Extra credits do not expire, but using paid services requires an active subscription. Each search shows its maximum before you approve.</p>
      {!s.signed_in&&s.auth_mode==='local_test'?<div className="premium-notice"><h3>Your private test workspace</h3><p className="small">Billing runs on this PC and uses the Hollis Stripe test account. No email sign-in or cloud database is needed.</p><button className="btn btn-primary" disabled={busy} onClick={act(()=>call('premiumLocalConnect'))}>Connect this PC</button></div>:!s.signed_in?<div className="form-grid">
        <label><span>Account email</span><input type="email" value={email} disabled={sent||busy} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>
        {sent&&<label><span>Email sign-in code</span><input value={code} inputMode="numeric" autoComplete="one-time-code" onChange={e=>setCode(e.target.value)} /></label>}
        <div className="form-row"><button className="btn btn-primary" disabled={busy||!s.account_ready||!email||(sent&&!code)} onClick={act(async()=>{if(sent){await call('premiumVerify',{email,code});setCode('')}else{await call('premiumSignIn',{email});setSent(true);notify('Check your email for a sign-in code.','ok')}})}>{busy?'Please wait…':sent?'Sign in':'Email me a sign-in code'}</button>{sent&&<button className="btn btn-quiet" disabled={busy} onClick={()=>setSent(false)}>Change email</button>}</div>
        {!s.account_ready&&<p className="small dim">Account sign-in is not connected yet.</p>}
      </div>:<>
        <p className="small">{s.email} · {s.status.replaceAll('_',' ')}</p>
        <div className="premium-balance"><strong>{s.available}</strong><div>credits available<p className="small dim">{s.reserved} reserved for work in progress</p></div></div>
        {s.paid_until>0&&<p className="small dim">Current paid period ends {new Date(s.paid_until).toLocaleDateString()}.</p>}
        <div className="form-row"><button className="btn btn-primary" disabled={busy||!s.billing_ready||s.demo} onClick={act(()=>call('premiumCheckout',{kind:s.premium?'topup':'premium'}))}>{s.premium?'Add credits':'Subscribe to Premium'}</button><button className="btn" disabled={busy||!s.billing_ready||s.demo} onClick={act(()=>call('premiumCheckout',{kind:'portal'}))}>Manage subscription</button><button className="btn btn-quiet" disabled={busy} onClick={act(()=>call('premiumSignOut'))}>Sign out</button></div>
        {!!s.history.length&&<details><summary>Credit activity</summary><ul className="premium-history">{s.history.slice(0,20).map((h,i)=><li key={i}><span>{h.kind==='reserve'?'Reserved maximum':h.kind==='release'?'Unused reservation released':h.kind==='settle'?'Final usage':h.kind==='grant'?'Credits added':h.kind}</span><span>{Math.abs(h.amount)} · {when(h.created)}</span></li>)}</ul><p className="small dim">Reservations hold credits temporarily. Final usage and releases settle that hold; they are not additional charges.</p></details>}
        {!!s.jobs.length&&<details><summary>Recent paid jobs</summary><ul className="premium-history">{s.jobs.map(j=><li key={j.id}><span>{j.state} · {j.charged}/{j.credits} credits{j.issue&&<small>{j.issue}</small>}</span><span>{when(j.created)}{['queued','running'].includes(j.state)&&<button className="btn btn-small" disabled={busy} onClick={act(()=>call('premiumCancel',{job_id:j.id}))}>Request stop</button>}</span></li>)}</ul></details>}
      </>}
      <div className="premium-capabilities">{s.capabilities.map(c=><p key={c.id}><strong>{c.label}</strong> · up to {c.credits_per_result} credits per result <span className="chip">{c.available?'Available':'Not connected'}</span><small>{c.description}</small></p>)}</div>
    </>}
    <button className="btn btn-small" onClick={reload}>Refresh Premium</button>
    <p className="small dim">A paid data search does not send outreach. Your existing message approval rules still apply.</p>
  </section>
}
