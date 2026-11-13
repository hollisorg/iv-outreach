import PageStage, { PageMetrics } from '../components/PageStage'
import { useEffect, useState } from 'react'
import { call, useData, when, STATUS, askAgent } from '../api'
import emptyArt from '../assets/outreach-discovery-v1.png'
import PaidResearch from '../components/PaidResearch'

const SORTS = [
  ['rank', 'Call first'],
  ['fit', 'Best fit'],
  ['newest', 'Newest'],
]

export default function Leads({ campaign, leadId, setLeadId, notify, openChat, go }) {
  const [sort, setSort] = useState('rank')
  const [leads, reload] = useData('listLeads', { campaign_id: campaign?.id || '__none__', sort, limit: 300 }, [campaign?.id, sort])
  if (!campaign) return <div className="page leads"><PageStage kind="leads" title="Leads" kicker="Infinite Variance / Your opportunities" subtitle="Real businesses. A reason to connect." /><div className="empty"><h2>Your next connection starts here.</h2><p>Create a campaign with your agent to begin your lead collection.</p><button className="btn btn-primary" onClick={openChat}>Open my agent</button></div></div>

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
      <PageStage kind="leads" title="Leads" kicker="Infinite Variance / Your opportunities" subtitle="Real businesses. A reason to connect." />
      <div className="page-context"><p className="eyebrow">{campaign.name}</p><PageMetrics items={[[leads?.length ?? '—', 'In this view'], [leads?.filter(l => l.fit_score >= 70).length ?? '—', 'Fit 70+'], [leads?.filter(l => l.first_reply_at).length ?? '—', 'Have replied']]} /></div>
      <div className="page-toolbar">
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => go('scanning')}>Open Scanning ↗</button>
          <div className="segmented" role="radiogroup" aria-label="Sort">
            {SORTS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sort === id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>
            ))}
          </div>
          <button className="btn" onClick={act(async () => {
            const r = await call('importCsv', { campaign_id: campaign.id })
            if (r) notify(`Imported ${r.added} of ${r.rows} rows (${r.duplicates} already here, ${r.updated || 0} updated, ${r.suppressed} on do-not-contact, ${r.conflicts || 0} conflicts, ${r.invalid} invalid).`, r.conflicts || r.invalid ? 'error' : 'ok')
          })}>Import CSV</button>
          <button className="btn" onClick={act(async () => {
            const r = await call('exportCsv', { campaign_id: campaign.id })
            if (r) notify(`Saved ${r.written}`, 'ok')
          })}>Export</button>
        </div>
      </div>


      {!leads ? (
        <p className="dim">Loading…</p>
      ) : !leads.length ? (
        <div className="empty art">
          <img src={emptyArt} alt="" width="200" height="200" />
          <div>
            <p className="empty-title">No leads in this campaign yet.</p>
            <p className="dim">Open Scanning, import a CSV, or let your agent research the web for you.</p>
            <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Find 15 real businesses that fit this campaign and add them.' }))}>Ask the agent to find some</button>
          </div>
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
                    <div className="small dim">
                      {[l.name ? l.company : null, l.title, l.category, l.location].filter(Boolean).join(' · ')}
                      {l.rating != null && <span className="stars"> · {l.rating}★ <span className="dim">({l.review_count})</span></span>}
                    </div>
                  </td>
                  <td><span className={`chip st-${l.status}`}>{STATUS[l.status]}</span></td>
                  <td className="num"><Score n={l.fit_score} /></td>
                  <td className="num"><Score n={l.first_reply_at ? l.engagement_score : null} warm /></td>
                  <td className="reach mono small">
                    <span className={l.email && l.email_status !== 'bounced' ? '' : 'off'} title={l.email ? `${l.email}${l.email_status === 'bounced' ? ' (bounced)' : ''}` : 'No email'}>@</span>
                    <span className={l.linkedin_url ? '' : 'off'} title={l.linkedin_url || 'No LinkedIn'}>in</span>
                    <span className={['facebook', 'instagram', 'x', 'tiktok'].some((k) => l.socials?.[k]) ? '' : 'off'} title={['facebook', 'instagram', 'x', 'tiktok'].filter((k) => l.socials?.[k]).join(', ') || 'No other socials'}>#</span>
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
          <LeadDrawer key={leadId} id={leadId} onClose={() => setLeadId(null)} notify={notify} onChanged={reload} />
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

const CHANNELS = { email: 'Email', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', x: 'X', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', threads: 'Threads', phone: 'Phone', other: 'Other' }
const PROFILE_KEYS = ['linkedin', 'facebook', 'instagram', 'x', 'tiktok', 'youtube', 'pinterest', 'threads']

function LeadLink({ url, children, notify, className = '' }) {
  let href
  try { const u = new URL(/^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) href = u.href } catch {}
  if (!href) return <span className="small dim">{children}</span>
  return <a className={`lead-link ${className}`} href={href} target="_blank" rel="noreferrer" title={href} onClick={e => {e.preventDefault();call('openLeadLink', {url:href}).catch(e=>notify(e.message))}}>{children}<span aria-hidden="true">↗</span></a>
}

function LeadVisual({ lead, notify }) {
  const [preview, setPreview] = useState(null)
  useEffect(() => { let active = true; setPreview(null); call('leadPreview', {id:lead.id}).then(data=>{if(active)setPreview(data)}).catch(()=>{if(active)setPreview({})}); return ()=>{active=false} }, [lead.id, lead.website])
  return <div className={`lead-visual ${preview?.image?'has-photo':''}`}>
    {preview?.image && <img className="lead-cover" src={preview.image} alt={`${lead.company || lead.name} website image`}/>}
    <div className="lead-visual-top"><span className="eyebrow">Business profile</span><span className={`chip st-${lead.status}`}>{STATUS[lead.status]}</span></div>
    <div className="lead-visual-bottom"><span className="lead-avatar">{preview?.logo?<img src={preview.logo} alt=""/>:(lead.company||lead.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]).join('')}</span><span className="small">{lead.category||'Your next connection'}<small>{preview?.image?'Image from their public website':!preview&&lead.website?'Looking for website imagery…':'Business snapshot'}</small></span></div>
    {preview?.image && <LeadLink url={preview.source} notify={notify} className="lead-image-source">View website</LeadLink>}
  </div>
}

// The lead's social profiles: confirmed ones (from its own site, or confirmed by you), and same-handle accounts the
// lookup found elsewhere, which stay unconfirmed until you say they're this business.
function Socials({ lead, notify, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [handle, setHandle] = useState('')
  const s = { ...lead.socials, ...(lead.linkedin_url ? { linkedin: lead.linkedin_url } : {}) }
  const confirmed = PROFILE_KEYS.filter((k) => s[k]).map((k) => [k, s[k]])
  const unconfirmed = (s.found || []).filter((f) => !f.confirmed)
  const find = async () => {
    setBusy(true)
    try {
      const r = await call('findSocials', { id: lead.id, handles: handle.trim() ? [handle.trim()] : undefined })
      const n = r.results.reduce((a, x) => a + x.found.length, 0)
      notify(`Checked ${r.results.reduce((a, x) => a + x.sites_checked, 0)} sites for ${r.handles.map((h) => `@${h.handle}`).join(', ')}: ${n} profile${n === 1 ? '' : 's'} found.`, 'ok')
      onChanged()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="socials">
      <h3>Socials</h3>
      {confirmed.length > 0 ? (
        <ul className="social-links">
          {confirmed.map(([k, url]) => (
            <li key={k}>
              <span className={`chan ${k}`}>{CHANNELS[k]}</span>
              <LeadLink url={url} notify={notify}>{url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/,'')}</LeadLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small dim">None confirmed yet.</p>
      )}
      <div className="form-row">
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle (optional), e.g. ableplumbing" aria-label="Handle to look up" />
        <button className="btn" disabled={busy} onClick={find}>{busy ? 'Checking ~480 sites…' : 'Find their socials'}</button>
      </div>
      {unconfirmed.length > 0 && (
        <details className="unconfirmed">
          <summary className="small">{unconfirmed.length} same-handle account{unconfirmed.length === 1 ? '' : 's'} elsewhere (not confirmed, often someone else)</summary>
          <ul>
            {unconfirmed.slice(0, 40).map((f) => (
              <li key={f.url} className="small">
                <span className="mono">{f.site}</span>
                <LeadLink url={f.url} notify={notify}>View profile</LeadLink>
                {f.channel && (
                  <button className="btn btn-small" onClick={async () => {
                    try {
                      await call('useSocial', { id: lead.id, channel: f.channel, url: f.url })
                      onChanged()
                    } catch (e) {
                      notify(e.message)
                    }
                  }}>Use this</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
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
    <aside className="drawer lead-profile" aria-label="Lead details">
      <div className="lead-profile-top"><span className="mono small">YOUR OPPORTUNITIES / PROFILE</span><button className="icon-btn" aria-label="Close lead profile" onClick={onClose}>×</button></div>
      <LeadVisual lead={lead} notify={notify}/>
      <div className="lead-profile-body">
      <header className="drawer-head">
        <div>
          <h2>{lead.name || lead.company}</h2>
          <p className="small dim">{[lead.name ? lead.company : null, lead.title, lead.location].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <div className="lead-destinations">
        {lead.website && <LeadLink url={lead.website} notify={notify}>Visit website</LeadLink>}
        <LeadLink url={lead.source === 'google_maps' && lead.source_url ? lead.source_url : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.company||lead.name,lead.location].filter(Boolean).join(' '))}`} notify={notify}>{lead.source === 'google_maps' && lead.source_url ? 'Google Maps' : 'Find on Maps'}</LeadLink>
        {lead.source_url && <LeadLink url={lead.source_url} notify={notify}>Original listing</LeadLink>}
      </div>
      <div className="lead-stat-grid"><div><small>Campaign fit</small><strong>{lead.fit_score ?? '—'}{lead.fit_score != null&&<em>/100</em>}</strong></div><div><small>Google rating</small><strong>{lead.rating != null ? `${lead.rating} ★` : '—'}</strong><span>{lead.review_count != null ? `${lead.review_count} reviews` : 'Not available'}</span></div><div><small>Conversation</small><strong>{lead.replies.length?'Replied':lead.messages.some(m=>m.status==='sent')?'Contacted':'Not yet'}</strong></div></div>
      {lead.fit_reason && <p className="lead-fit-note">{lead.fit_reason}</p>}
      <section className="lead-contact"><h3>Contact & location</h3>
      <dl className="facts">
        {lead.location && <div><dt>Location</dt><dd>{lead.location}</dd></div>}
        {lead.phone && <div><dt>Phone</dt><dd className="mono small">{lead.phone}</dd></div>}
        <div><dt>Email</dt><dd className="mono small">{lead.email || '–'}{lead.email && <span className="dim"> ({lead.email_status.replace(/_/g, ' ')})</span>}</dd></div>
      </dl>
      </section>
      {lead.research && <section className="research-evidence" aria-label="Research evidence">
        <h3>Why this business fits</h3>
        <p className="small dim">Agent research · {lead.research.confidence} confidence · {when(lead.research.checked_at)}. Buying intent unconfirmed.</p>
        <h4>Observed on public sources</h4>
        {lead.research.evidence.map((item, i) => <div className="msg-mini" key={i}>
          <p className="small">{item.observation}</p><LeadLink url={item.url} notify={notify}>Read source</LeadLink>
        </div>)}
        <h4>Potential opportunity</h4><p className="small">{lead.research.opportunity}</p>
        {lead.research.unknowns.length > 0 && <><h4>Still unknown</h4><ul className="small">{lead.research.unknowns.map((item,i)=><li key={i}>{item}</li>)}</ul></>}
      </section>}
      {lead.sources?.map((source) => (
        <section key={`${source.provider}:${source.external_id}`}>
          <h3>Imported fit explanation</h3>
          <p className="small">{source.reason || 'No explanation supplied.'}</p>
          <p className="small dim">Source ID: {source.external_id}{source.qualified_at ? ` · Qualified ${source.qualified_at}` : ''}</p>
        </section>
      ))}
      <Socials lead={lead} notify={notify} onChanged={() => (reload(), onChanged())} />
      <PaidResearch key={lead.id} lead={lead} notify={notify} onChanged={() => (reload(), onChanged())} />
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
              <span className="mono small">{CHANNELS[m.channel] || m.channel} · step {m.step} · {m.status}</span>
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
              {['email', 'linkedin', 'facebook', 'instagram', 'x', 'tiktok', 'phone', 'other'].map((c) => <option key={c} value={c}>{CHANNELS[c]}</option>)}
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
      </div>
    </aside>
  )
}
