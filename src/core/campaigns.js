// A campaign = one ideal-customer profile (ICP) + one offer.
import { now, newId, logEvent } from './db.js'
import { campaignBusiness } from './businesses.js'
import { normUrl } from './normalize.js'

const ICP_FIELDS = [
  'industries', 'titles', 'locations', 'company_size', 'revenue_band',
  'keywords', 'exclusions', 'buying_signals', 'notes',
]

function cleanIcp(icp = {}) {
  const out = {}
  for (const key of ICP_FIELDS) {
    const v = icp[key]
    if (v == null || v === '') continue
    out[key] = Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : String(v).trim()
  }
  return out
}

function hydrate(row) {
  if (!row) return null
  const { icp_json, ...rest } = row
  return { ...rest, icp: JSON.parse(icp_json || '{}') }
}

export function createCampaign(db, { name, offer, icp, source_url, business_id }) {
  if (!name || !String(name).trim()) throw new Error('Campaign needs a name')
  const business = campaignBusiness(db,business_id)
  const id = newId()
  const t = now()
  db.prepare(`insert into campaigns (id, name, offer, icp_json, source_url, created_at, updated_at, business_id)
    values (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, String(name).trim(), offer || null, JSON.stringify(cleanIcp(icp)), normUrl(source_url), t, t, business.id)
  logEvent(db, 'campaign_created', null, { campaign_id: id })
  return getCampaign(db, id)
}

export function updateCampaign(db, id, patch) {
  const current = getCampaign(db, id)
  if (!current) throw new Error(`No campaign ${id}`)
  if (patch.name !== undefined && !String(patch.name).trim()) throw new Error('Campaign needs a name')
  if (patch.business_id !== undefined && !patch.business_id) throw new Error('Choose an existing business.')
  const businessId = patch.business_id === undefined ? current.business_id : campaignBusiness(db,patch.business_id).id
  const icp = patch.icp ? cleanIcp({ ...current.icp, ...patch.icp }) : current.icp
  db.prepare(`update campaigns set name = ?, offer = ?, icp_json = ?, source_url = ?, status = ?, updated_at = ?, business_id = ? where id = ?`)
    .run(
      patch.name ?? current.name,
      patch.offer ?? current.offer,
      JSON.stringify(icp),
      patch.source_url !== undefined ? normUrl(patch.source_url) : current.source_url,
      patch.status ?? current.status,
      now(),
      businessId,
      id,
    )
  return getCampaign(db, id)
}

export function getCampaign(db, id) {
  return hydrate(db.prepare('select * from campaigns where id = ?').get(id))
}

export function listCampaigns(db, { includeArchived = false, business_id } = {}) {
  const rows = db.prepare(`
    select c.*,
      (select count(*) from leads l where l.campaign_id = c.id) as lead_count,
      (select count(*) from leads l where l.campaign_id = c.id and l.status in ('contacted','replied','interested','meeting','not_interested')) as contacted_count,
      (select count(*) from leads l where l.campaign_id = c.id and l.first_reply_at is not null) as replied_count,
      (select count(*) from messages m where m.campaign_id = c.id and m.status = 'draft') as drafts_waiting
    from campaigns c
    ${includeArchived ? "where 1=1" : "where c.status != 'archived'"} ${business_id ? "and c.business_id = ?" : ""}
    order by c.created_at desc`).all(...(business_id ? [business_id] : []))
  return rows.map(hydrate)
}
