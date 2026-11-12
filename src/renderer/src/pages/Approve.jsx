import PageStage, { PageMetrics } from '../components/PageStage'
import { useEffect, useState } from 'react'
import { call, useData, askAgent } from '../api'
import emptyArt from '../assets/outreach-approval-v1.png'

const CH = { email: 'Email', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', x: 'X', tiktok: 'TikTok' }
const LIMIT = { facebook: 2000, instagram: 1000, x: 10000, tiktok: 500 }

export default function Approve({ campaign, overview, notify, go, openChat }) {
  const [drafts, reload] = useData('listMessages', { campaign_id: campaign?.id || '__none__', status: 'draft' }, [campaign?.id])
  const [approved] = useData('listMessages', { campaign_id: campaign?.id || '__none__', status: 'approved' }, [campaign?.id])
  if (!campaign) return <div className="page approve"><PageStage kind="approve" title="Approve" kicker="Infinite Variance / The final say" subtitle="Thoughtful outreach starts with your OK." /><div className="empty"><h2>Your voice. Your approval.</h2><p>Create a campaign, then ask your agent to prepare drafts.</p><button className="btn btn-primary" onClick={openChat}>Open my agent</button></div></div>
  const clean = (drafts || []).filter((d) => !d.issues.some((i) => i.level === 'block'))
  const approve = async (ids) => {
    try {
      const r = await call('approveMessages', { ids })
      const no = r.filter((x) => !x.approved)
      if (no.length) notify(no[0].reason)
      else notify(`Approved ${r.length}. Emails send from your mailbox within your daily cap; social notes go to the Social list.`, 'ok')
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <div className="page approve">
      <PageStage kind="approve" title="Approve" kicker="Infinite Variance / The final say" subtitle="Thoughtful outreach starts with your OK." />
      <div className="page-context"><p className="eyebrow">{campaign.name}</p><PageMetrics items={[[drafts?.length ?? '—', 'To review'], [clean.length, 'No blocking issues'], [approved?.length ?? '—', 'Approved / waiting']]} /></div>
      <div className="page-toolbar"><p className="small dim">Review the words, check the details, then approve.</p>
        <div className="head-actions">
          {clean.length > 1 && <button className="btn btn-primary" onClick={() => approve(clean.map((d) => d.id))}>Approve {clean.length} with no issues</button>}
        </div>
      </div>

      {overview && !overview.sender_ready && (
        <div className="banner">
          <div><strong>Emails can’t be approved until your sender profile is complete.</strong></div>
          <button className="btn" onClick={() => go('settings')}>Open Settings</button>
        </div>
      )}

      {!drafts ? (
        <p className="dim">Loading…</p>
      ) : !drafts.length ? (
        <div className="empty art">
          <img src={emptyArt} alt="" width="200" height="200" />
          <div>
            <p className="empty-title">No drafts waiting.</p>
            <p className="dim">Drafts the agent writes land here for your OK. Nothing sends until you approve it.</p>
            <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Draft short first emails for my best-fit researched leads.' }))}>Ask the agent to draft some</button>
          </div>
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
  const limit = d.channel === 'linkedin' ? (d.step === 1 ? 300 : 1900) : LIMIT[d.channel] || null
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
          <span className={`chan ${d.channel}`}>{CH[d.channel] || d.channel}</span> step {d.step}
          {d.fit_score != null && <span className="dim"> · fit {d.fit_score}</span>}
        </span>
      </header>
      <p className="mono small dim to">{d.channel === 'email' ? `To ${d.lead_email || 'no email'}` : d.channel === 'linkedin' ? d.lead_linkedin_url?.replace('https://www.', '') || 'no LinkedIn profile' : `Sent by you from the Social list`}</p>
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
