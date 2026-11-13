import { useEffect,useState } from 'react'
import { call,useData } from '../api'
export default function PaidResearch({lead,notify,onChanged}){
  const [verification]=useData('premiumContactVerification',{lead_id:lead.id})
  const [status,setStatus]=useState(null),[quote,setQuote]=useState(null),[job,setJob]=useState(null),[busy,setBusy]=useState(false)
  useEffect(()=>{let alive=true;call('premiumStatus').then(s=>alive&&setStatus(s),()=>{});return()=>{alive=false}},[lead.id])
  useEffect(()=>{let alive=true;call('premiumLatest',{lead_id:lead.id}).then(j=>alive&&setJob(j),()=>{});return()=>{alive=false}},[lead.id])
  useEffect(()=>{if(!job||!['queued','running'].includes(job.state))return;let alive=true;const t=setInterval(()=>call('premiumJob',{job_id:job.id}).then(j=>alive&&setJob(j),()=>{}),4000);return()=>{alive=false;clearInterval(t)}},[job?.id,job?.state])
  const act=fn=>async()=>{setBusy(true);try{await fn()}catch(e){notify(e.message)}finally{setBusy(false)}}
  const capability=lead.email?'email_verify':'email_find',available=status?.capabilities?.find(c=>c.id===capability)?.available
  if(!status?.configured||lead.status==='suppressed')return null
  return <section className="paid-research" aria-label="Paid contact research"><h3>Contact data</h3><p className="small dim">Optional Premium research. Free website research remains available.</p>
    {!status.signed_in||!status.premium?<p className="small">Set up Premium in Settings to use paid contact data.</p>:<>
      {status.demo&&<p className="premium-notice">DEMO · Fictional result</p>}
      <button className="btn" disabled={busy||!available||verification?.fresh||!!(job&&['queued','running','review'].includes(job.state))} onClick={act(async()=>{setQuote(await call('premiumQuote',{capability,lead_ids:[lead.id]}));setJob(null)})}>{verification?.fresh?'Recently verified':lead.email?'Quote email verification':'Quote work email search'}</button>
      {verification?.fresh&&<p className="small dim">Deliverable when checked on {new Date(verification.checked_at).toLocaleDateString()}. Included verification is reused for 30 days to avoid a duplicate charge. Delivery is not guaranteed.</p>}
      {!available&&<p className="small dim">This service is not connected yet.</p>}
      {quote&&!job&&<div className="premium-notice"><strong>Up to {quote.max_credits} credits</strong><p className="small">One selected contact. Expires {new Date(quote.expires).toLocaleTimeString()}. Review the desktop confirmation to proceed.</p><button className="btn btn-primary" disabled={busy} onClick={act(async()=>setJob(await call('premiumRun',{quote_id:quote.id})))}>Review and use credits</button></div>}
      {job&&<div aria-live="polite"><p><strong>{job.state}</strong> · {job.charged} of up to {job.max_credits} credits used</p>{job.issue&&<p role="alert">{job.issue}</p>}{job.result.map((r,i)=><div className="msg-mini" key={i}><p>{r.email||'No email found'} · {r.status}</p><p className="small dim">{r.provider} · {r.checked_at&&new Date(r.checked_at).toLocaleDateString()}. Verification is not a delivery guarantee.</p>{r.status==='deliverable'&&r.email&&!lead.email&&<button className="btn" disabled={busy} onClick={act(async()=>{await call('premiumApply',{job_id:job.id,lead_id:lead.id});onChanged();notify('Provider email saved. Nothing sent.','ok')})}>Use email</button>}</div>)}{['queued','running'].includes(job.state)&&<button className="btn btn-small" disabled={busy} onClick={act(async()=>setJob(await call('premiumCancel',{job_id:job.id})))}>Request stop</button>}<p className="small dim">Work already submitted may finish and use credits after a stop request.</p></div>}
    </>}
  </section>
}
