import { now, newId, logEvent } from './db.js'
const hydrate = row => { if (!row) return null; const { profile_json, ...rest } = row; return { ...rest, profile: JSON.parse(profile_json || '{}') } }
function cleanProfile(input = {}) {
  const profile = {}
  for (const key of ['offer','audience','website','location','kind','goal','voice']) if (input[key] !== undefined) profile[key] = String(input[key] || '').trim().slice(0,1200)
  for (const key of ['logo_id','cover_id']) if (input[key] !== undefined) {
    const value = String(input[key] || '')
    if (value && !/^[a-f0-9]{64}\.(png|jpg)$/.test(value)) throw new Error('Choose a business image from the app.')
    profile[key] = value
  }
  if (input.accent !== undefined) {
    if (!/^#[a-f0-9]{6}$/i.test(input.accent)) throw new Error('Choose a valid brand color.')
    profile.accent = input.accent
  }
  if (input.cover_preset !== undefined) {
    if (!['signal','discovery','connection','approval'].includes(input.cover_preset)) throw new Error('Choose a built-in cover.')
    profile.cover_preset = input.cover_preset
  }
  if (profile.website) {
    const url = new URL(/^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`)
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public business website without sign-in details.')
    profile.website = url.toString()
  }
  return profile
}
export function getBusiness(db, id) { return hydrate(db.prepare('select * from businesses where id = ?').get(id)) }
export function listBusinesses(db) {
  return db.prepare(`select b.*, (select count(*) from campaigns c where c.business_id=b.id and c.status!='archived') campaign_count,
    (select count(*) from leads l join campaigns c on c.id=l.campaign_id where c.business_id=b.id) lead_count
    from businesses b order by b.created_at, b.id`).all().map(hydrate)
}
export function createBusiness(db, { name, profile = {} }) {
  const label = String(name || '').trim().slice(0,160)
  if (!label) throw new Error('Give this business or brand a name.')
  const clean = cleanProfile(profile), id = newId(), at = now()
  db.prepare('insert into businesses(id,name,profile_json,created_at,updated_at) values(?,?,?,?,?)').run(id,label,JSON.stringify(clean),at,at)
  logEvent(db,'business_created',null,{business_id:id})
  return getBusiness(db,id)
}
export function updateBusiness(db, id, { name, profile } = {}) {
  const current = getBusiness(db,id)
  if (!current) throw new Error('Business not found.')
  const label = name === undefined ? current.name : String(name || '').trim().slice(0,160)
  if (!label) throw new Error('Give this business or brand a name.')
  const next = profile ? cleanProfile({...current.profile,...profile}) : current.profile
  db.prepare('update businesses set name=?,profile_json=?,updated_at=? where id=?').run(label,JSON.stringify(next),now(),id)
  return getBusiness(db,id)
}
export function campaignBusiness(db, id) {
  if (id) { const business=getBusiness(db,id); if (!business) throw new Error('Choose an existing business.'); return business }
  const businesses=listBusinesses(db)
  if (businesses.length > 1) throw new Error('Choose a business_id for this campaign; more than one business exists.')
  return businesses[0] || createBusiness(db,{name:'My business'})
}
