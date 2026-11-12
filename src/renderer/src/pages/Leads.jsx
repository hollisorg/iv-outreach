import { useEffect, useState } from 'react'
import { call, useData, when, STATUS, askAgent } from '../api'

const SORTS = [
  ['rank', 'Call first'],
  ['fit', 'Best fit'],
  ['newest', 'Newest'],
]

export default function Leads({ campaign, leadId, setLeadId, notify, openChat }) {
  const [sort, setSort] = useState('rank')
  const [leads, reload] = useData('listLeads', { campaign_id: campaign?.id, sort, limit: 300 }, [campaign?.id, sort])
  if (!campaign) return <div className="page"><h1>Leads</h1><p className="dim">No campaign yet. Ask in the chat to start one.</p></div>

  const act = (fn) => async () => {
    try {
      const r = await fn()
      reload()
      return r
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <div className={`page leads ${leadId ? 'with-drawer' : ''}`}>
      <header className="page-head row">
        <div>
          <p className="eyebrow">{campaign.name}</p>
          <h1>Leads</h1>
        </div>
        <div className="head-actions">
          <div className="segmented" role="radiogroup" aria-label="Sort">
            {SORTS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sort === id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>
            ))}
          </div>
          <button className="btn" onClick={act(async () => {
            const r = await call('importCsv', { campaign_id: campaign.id })
            if (r) notify(`Imported ${r.added} of ${r.rows} rows (${r.duplicates} already here, ${r.suppressed} on do-not-contact).`, 'ok')
          })}>Import CSV</button>
          <button className="btn" onClick={act(async () => {
            const r = await call('exportCsv', { campaign_id: campaign.id })
            if (r) notify(`Saved ${r.written}`, 'ok')
          })}>Export</button>
        </div>
      </header>

      {!leads ? (
        <p className="dim">Loading…</p>
      ) : !leads.length ? (
        <div className="empty">
          <p>No leads in this campaign yet.</p>
          <button className="btn btn-primary" onClick={() => (openChat(), askAgent({ text: 'Find 15 real businesses that fit this campaign and add them.' }))}>Ask the agent to find some</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Lead</th>
                <th>Status</th>
                <th className="num">Fit</th>
                <th className="num">Reply</th>
                <th>Reach</th>
                <th>Last touch</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => (
                <tr key={l.id} className={l.id === leadId ? 'on' : ''} onClick={() => setLeadId(l.id)}>
                  <td className="num mono dim">{i + 1}</td>
                  <td>
                    <div className="who">{l.name || l.company || l.website}</div>
                    <div className="small dim">{[l.name ? l.company : null, l.title, l.location].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td><span className={`chip st-${l.status}`}>{STATUS[l.status]}</span></td>
                  <td className="num"><Score n={l.fit_score} /></td>
                  <td className="num"><Score n={l.first_reply_at ? l.engagement_score : null} warm /></td>
                  <td className="reach mono small">
                    <span className={l.email ? '' : 'off'} title={l.email || 'No email'}>@</span>
                    <span className={l.linkedin_url ? '' : 'off'} title={l.linkedin_url || 'No LinkedIn'}>in</span>
                  </td>
                  <td className="small dim">{when(l.last_contacted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leadId && (
        <>
          <button className="drawer-backdrop" aria-label="Close lead details" onClick={() => setLeadId(null)} />
          <LeadDrawer id={leadId} onClose={() => setLeadId(null)} notify={notify} onChanged={reload} />
        </>
      )}
    </div>
  )
}

function Score({ n, warm }) {
  if (n == null) return <span className="dim">–</span>
  return (
    <span className={`score ${warm ? 'warm' : ''}`}>
      <span className="score-bar" aria-hidden="true"><span style={{ width: `${n}%` }} /></span>
      <span className="mono">{n}</span>
    </span>
  )
}

const INTENTS = [
  ['interested', 'Interested'], ['meeting', 'Booked a meeting'], ['question', 'Asked a question'], ['not_now', 'Not now'],
  ['not_interested', 'Not interested'], ['unsubscribe', 'Asked to stop'], ['none', 'Other'],
]

function LeadDrawer({ id, onClose, notify, onChanged }) {
  const [lead, reload] = useData('getLead', { id }, [id])
  const [reply, setReply] = useState({ channel: 'email', intent: 'interested', sentiment: 'positive', text: '' })
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!lead) return <aside className="drawer"><p className="dim">Loading…</p></aside>
  const act = (fn) => async () => {
    try {
      await fn()
      reload()
      onChanged()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <aside className="drawer" aria-label="Lead details">
      <header className="drawer-head">
        <div>
          <h2>{lead.name || lead.company}</h2>
          <p className="small dim">{[lead.name ? lead.company : null, lead.title, lead.location].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <dl className="facts">
        <div><dt>Status</dt><dd><span className={`chip st-${lead.status}`}>{STATUS[lead.status]}</span></dd></div>
        <div><dt>Fit</dt><dd>{lead.fit_score ?? '–'}{lead.fit_reason && <span className="small dim"> · {lead.fit_reason}</span>}</dd></div>
        <div><dt>Email</dt><dd className="mono small">{lead.email || '–'}{lead.email && <span className="dim"> ({lead.email_status.replace(/_/g, ' ')})</span>}</dd></div>
        <div><dt>LinkedIn</dt><dd className="mono small">{lead.linkedin_url ? lead.linkedin_url.replace('https://www.', '') : '–'}</dd></div>
        <div><dt>Website</dt><dd className="mono small">{lead.website || '–'}</dd></div>
        {lead.source_url && <div><dt>Found on</dt><dd className="mono small">{lead.source_url}</dd></div>}
      </dl>
      {lead.site_summary && (
        <section>
          <h3>From their site</h3>
          <p className="small summary">{lead.site_summary.slice(0, 700)}</p>
        </section>
      )}
      {lead.notes && <section><h3>Notes</h3><p className="small">{lead.notes}</p></section>}
      {lead.messages.length > 0 && (
        <section>
          <h3>Messages</h3>
          {lead.messages.map((m) => (
            <div key={m.id} className="msg-mini">
              <span className="mono small">{m.channel === 'email' ? 'Email' : 'LinkedIn'} · step {m.step} · {m.status}</span>
              {m.subject && <strong className="small">{m.subject}</strong>}
              <p className="small">{m.body}</p>
            </div>
          ))}
        </section>
      )}
      {lead.replies.length > 0 && (
        <section>
          <h3>Replies</h3>
          {lead.replies.map((r) => (
            <div key={r.id} className="msg-mini reply">
              <span className="mono small">{r.channel} · {r.intent.replace(/_/g, ' ')} · {when(r.received_at)}</span>
              {r.text && <p className="small">{r.text}</p>}
            </div>
          ))}
        </section>
      )}
      {lead.status !== 'suppressed' && (
        <section className="log-reply">
          <h3>Log a reply</h3>
          <div className="form-row">
            <select value={reply.channel} onChange={(e) => setReply({ ...reply, channel: e.target.value })} aria-label="Channel">
              <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="phone">Phone</option><option value="other">Other</option>
            </select>
            <select value={reply.intent} onChange={(e) => setReply({ ...reply, intent: e.target.value, sentiment: ['not_interested', 'unsubscribe'].includes(e.target.value) ? 'negative' : ['interested', 'meeting'].includes(e.target.value) ? 'positive' : 'neutral' })} aria-label="What they said">
              {INTENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <textarea rows={2} placeholder="What they said (optional)" value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} />
          <div className="form-row">
            <button className="btn btn-primary" onClick={act(async () => {
              await call('logReply', { lead_id: lead.id, ...reply })
              setReply({ ...reply, text: '' })
            })}>Save reply</button>
            <button className="btn btn-quiet" onClick={act(() => (lead.email ? call('suppress', { kind: 'email', value: lead.email, reason: 'Marked in app' }) : call('suppress', { kind: lead.linkedin_url ? 'linkedin' : 'domain', value: lead.linkedin_url || lead.domain, reason: 'Marked in app' })))}>
              Do not contact
            </button>
          </div>
        </section>
      )}
    </aside>
  )
}
