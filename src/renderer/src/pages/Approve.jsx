import { useEffect, useState } from 'react'
import { call, useData, askAgent } from '../api'

export default function Approve({ campaign, overview, notify, go, openChat }) {
  const [drafts, reload] = useData('listMessages', { campaign_id: campaign?.id, status: 'draft' }, [campaign?.id])
  const [approved] = useData('listMessages', { campaign_id: campaign?.id, status: 'approved' }, [campaign?.id])
  if (!campaign) return <div className="page"><h1>Approve</h1><p className="dim">No campaign yet.</p></div>
  const clean = (drafts || []).filter((d) => !d.issues.some((i) => i.level === 'block'))
  const approve = async (ids) => {
    try {
      const r = await call('approveMessages', { ids })
      const no = r.filter((x) => !x.approved)
      if (no.length) notify(no[0].reason)
      else notify(`Approved ${r.length}. Emails wait in the send queue until mailbox sending is connected; LinkedIn notes go to your send list.`, 'ok')
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <div className="page approve">
      <header className="page-head row">
        <div>
          <p className="eyebrow">{campaign.name}</p>
          <h1>Approve</h1>
          <p className="lede">Nothing goes out until you approve it. {approved?.length ? `${approved.length} approved and waiting to send.` : ''}</p>
        </div>
        <div className="head-actions">
          {clean.length > 1 && <button className="btn btn-primary" onClick={() => approve(clean.map((d) => d.id))}>Approve {clean.length} with no issues</button>}
        </div>
      </header>

      {overview && !overview.sender_ready && (
        <div className="banner">
          <div><strong>Emails can’t be approved until your sender profile is complete.</strong></div>
          <button className="btn" onClick={() => go('settings')}>Open Settings</button>
        </div>
      )}

      {!drafts ? (
        <p className="dim">Loading…</p>
      ) : !drafts.length ? (
        <div className="empty">
          <p>No drafts waiting.</p>
          <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Draft short first emails for my best-fit researched leads.' }))}>Ask the agent to draft some</button>
        </div>
      ) : (
        <div className="drafts">
          {drafts.map((d) => <Draft key={d.id} d={d} onApprove={() => approve([d.id])} onChanged={reload} notify={notify} />)}
        </div>
      )}
    </div>
  )
}

function Draft({ d, onApprove, onChanged, notify }) {
  const [subject, setSubject] = useState(d.subject || '')
  const [body, setBody] = useState(d.body)
  useEffect(() => {
    setSubject(d.subject || '')
    setBody(d.body)
  }, [d.id, d.subject, d.body])
  const dirty = subject !== (d.subject || '') || body !== d.body
  const blocks = d.issues.filter((i) => i.level === 'block')
  const warns = d.issues.filter((i) => i.level === 'warn')
  const limit = d.channel === 'linkedin' && d.step === 1 ? 300 : null
  const save = async () => {
    try {
      await call('editMessage', { id: d.id, subject, body })
      onChanged()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <article className={`draft ${blocks.length ? 'blocked' : ''}`}>
      <header className="draft-head">
        <div>
          <strong>{d.lead_name || d.lead_company}</strong>
          <span className="small dim"> {d.lead_name ? `· ${d.lead_company || ''}` : ''}</span>
        </div>
        <span className="mono small">
          <span className={`chan ${d.channel}`}>{d.channel === 'email' ? 'Email' : 'LinkedIn'}</span> step {d.step}
          {d.fit_score != null && <span className="dim"> · fit {d.fit_score}</span>}
        </span>
      </header>
      <p className="mono small dim to">{d.channel === 'email' ? `To ${d.lead_email || 'no email'}` : d.lead_linkedin_url?.replace('https://www.', '') || 'no LinkedIn profile'}</p>
      {d.channel === 'email' && <input className="subject" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />}
      <textarea value={body} rows={Math.min(12, Math.max(4, body.split('\n').length + 1))} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
      {limit && <p className={`mono small ${body.length > limit ? 'bad' : 'dim'}`}>{body.length}/{limit}</p>}
      {(blocks.length > 0 || warns.length > 0) && (
        <ul className="issues">
          {blocks.map((i) => <li key={i.msg} className="block">{i.msg}</li>)}
          {warns.map((i) => <li key={i.msg} className="warn">{i.msg}</li>)}
        </ul>
      )}
      <footer className="draft-foot">
        {dirty ? (
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        ) : (
          <button className="btn btn-primary" disabled={blocks.length > 0} onClick={onApprove}>Approve</button>
        )}
        <button className="btn btn-quiet" onClick={async () => { await call('cancelMessages', { ids: [d.id] }); onChanged() }}>Discard</button>
        {d.channel === 'email' && <span className="small dim foot-note">Your signature, postal address and a “reply stop” line are added when it sends.</span>}
      </footer>
    </article>
  )
}
