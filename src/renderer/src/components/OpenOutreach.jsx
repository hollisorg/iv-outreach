import { useState } from 'react'
import { call, askAgent, useData } from '../api'

export default function OpenOutreach({ campaign, notify, onDone, openChat }) {
  const [setup] = useData('openOutreachSetup')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const act = async (importing) => {
    setBusy(true)
    try {
      if (!importing) {
        setPreview(null)
        setPreview(await call('previewOpenOutreach', { campaign_id: campaign.id }))
      } else {
        const r = await call('importOpenOutreach', { campaign_id: campaign.id })
        setPreview(null)
        notify(`OpenOutreach: ${r.added} new, ${r.duplicates} already here (${r.updated} updated), ${r.suppressed} on do-not-contact, ${r.conflicts} conflicts skipped, ${r.invalid} invalid.`, r.conflicts || r.invalid ? 'error' : 'ok')
        onDone()
      }
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="openoutreach-panel" aria-label="OpenOutreach import">
      <p className="eyebrow">Lead discovery</p>
      <h2>Find your next conversation</h2>
      <p>OpenOutreach researches and qualifies leads for <strong>{campaign.name}</strong>. Ask in chat and results appear here as they arrive.</p>
      <button className="btn btn-primary" onClick={() => { openChat(); askAgent({ text: `Use OpenOutreach to find 10 leads for campaign ${campaign.id}. Check setup first, and do not buy email lookups.`, send: true }) }}>Find leads from chat</button>
      <p className="small dim">{setup?.ready ? 'Engine ready. Each search shows its usage approval before it starts.' : 'Set up the engine and provider keys in Settings → OpenOutreach.'}</p>
      <h3>Already have an export?</h3>
      <p className="small">You can also bring an existing CSV into this campaign, with fit explanations and duplicate checks.</p>
      <details>
        <summary>How to get the export</summary>
        <p className="small">In your configured OpenOutreach terminal, export the leads you already have:</p>
        <code>openoutreach find 0 &gt; leads.csv</code>
        <p className="small dim">This command exports an existing OpenOutreach store. Use the chat button above for new searches inside IV Outreach.</p>
      </details>
      <p className="small dim">Repeat exports match existing leads. Your edits, replies, approvals and do-not-contact list stay in effect. Social messages remain in the manual send list.</p>
      {preview && (
        <div className="openoutreach-preview" role="status">
          <p><strong>{preview.rows} rows</strong> · {preview.with_email} with an email · showing up to five</p>
          <ul>
            {preview.sample.map((lead, i) => (
              <li key={i}><strong>{lead.name || lead.company}</strong><span className="small dim">{[lead.title, lead.name && lead.company].filter(Boolean).join(' · ')}</span><p className="small">{lead.reason || 'No fit explanation supplied.'}</p></li>
            ))}
          </ul>
        </div>
      )}
      <div className="head-actions">
        <button className="btn" disabled={busy} onClick={() => act(false)}>{busy ? 'Working…' : preview ? 'Choose a different CSV' : 'Choose OpenOutreach CSV'}</button>
        {preview && <button className="btn btn-primary" disabled={busy || !preview.rows} onClick={() => act(true)}>Import into {campaign.name}</button>}
      </div>
    </section>
  )
}
