import { useState } from 'react'
import { BrandPreview } from './BrandIdentity'
import { call, useData } from '../api'

export default function BusinessSettings({ business, businesses, addBusiness, addCampaign, editBusiness, notify }) {
  const [campaigns] = useData('listCampaigns', { business_id: business?.id || '__none__', includeArchived: true })
  return <div className="business-settings">
    <div className="actions"><button className="btn" onClick={addBusiness}>Add business</button><button className="btn" disabled={!business} onClick={addCampaign}>New campaign</button></div>
    {business ? <>
      <div className="business-brand-editor" data-guide="brand-art"><BrandPreview business={business}/><button className="btn" onClick={editBusiness}>Edit logo, graphics & business ↗</button></div>
      <BusinessForm key={`${business.id}-${business.updated_at}`} business={business} notify={notify} />
      <div className="business-campaigns"><h3>Campaigns in {business.name}</h3><p className="small dim">Each campaign keeps its leads, research and messages. Moving a campaign moves that whole history.</p>
        {campaigns?.length ? campaigns.map(c => <CampaignRow key={`${c.id}-${c.business_id}`} campaign={c} businesses={businesses} notify={notify} />) : <p className="dim">No campaigns yet. Create one to start finding the right people.</p>}
      </div>
    </> : <p className="dim">Add your first business, then create a campaign for its audience and offer.</p>}
  </div>
}
function BusinessForm({ business, notify }) {
  const [form, setForm] = useState({ ...business.profile, name: business.name }), [busy, setBusy] = useState(false)
  const save = async e => {
    e.preventDefault(); setBusy(true)
    try { const { name, ...profile } = form; await call('updateBusiness', { id: business.id, name, profile }); notify('Business profile saved.', 'ok') } catch (e) { notify(e.message) } finally { setBusy(false) }
  }
  return <form onSubmit={save}>
    {[
      ['name','Business name','The brand shown in your workspace.'],
      ['website','Website','Your public business website.'],
      ['offer','Your offer','What this business helps people do.'],
      ['audience','Your audience','Who your campaigns should reach.'],
      ['location','Region','Where you want to grow.'],
      ['voice','Brand voice','How the agent should sound when drafting.'],
    ].map(([key,title,help]) => <label className="iv-set-field" key={key}><span>{title}<small>{help}</small></span><input aria-label={title} required={key === 'name'} maxLength={key === 'name' ? 160 : 1200} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
    <button className="btn btn-primary" disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save business profile'}</button>
  </form>
}
function CampaignRow({ campaign, businesses, notify }) {
  const [editing, setEditing] = useState(false), [name, setName] = useState(campaign.name), [businessId, setBusinessId] = useState(campaign.business_id), [busy, setBusy] = useState(false)
  const save = async e => {
    e.preventDefault(); setBusy(true)
    try { await call('updateCampaign', { id: campaign.id, name: name.trim(), business_id: businessId }); setEditing(false); notify(businessId === campaign.business_id ? 'Campaign saved.' : 'Campaign and its history moved to the selected business.', 'ok') } catch (e) { notify(e.message) } finally { setBusy(false) }
  }
  return <article className="business-campaign-row">
    <div><strong>{campaign.name}</strong><span className="small dim">{campaign.lead_count} leads · {campaign.status}</span></div>
    <button className="btn" aria-expanded={editing} onClick={() => { setName(campaign.name); setBusinessId(campaign.business_id); setEditing(!editing) }}>{editing ? 'Cancel edit' : 'Edit campaign'}</button>
    {editing && <form onSubmit={save} className="form-grid"><label><span>Campaign name</span><input required value={name} onChange={e => setName(e.target.value)} /></label><label><span>Belongs to business</span><select value={businessId} onChange={e => setBusinessId(e.target.value)}>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : businessId === campaign.business_id ? 'Save campaign' : 'Move campaign & history'}</button></form>}
  </article>
}
