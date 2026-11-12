import { getSetting, setSetting } from '../core/db.js'
import { createCampaign, getCampaign, listCampaigns } from '../core/campaigns.js'

import { createBusiness, getBusiness, updateBusiness } from '../core/businesses.js'

const KEY = 'iv_onboarding_v1'
export function onboardingStatus(db) {
  const saved = getSetting(db, KEY, {})
  return { ...saved, profile: saved.profile || {}, step: saved.step || 0, existingCampaigns: listCampaigns(db).length, showOnLaunch: !saved.completedAt && !saved.dismissedAt && listCampaigns(db).length === 0 }
}
export function cleanProfile(input = {}, { validateWebsite = true } = {}) {
  const out = {}
  for (const key of ['name', 'company', 'kind', 'offer', 'audience', 'location', 'website', 'goal']) out[key] = String(input[key] || '').trim().slice(0, key === 'offer' || key === 'audience' ? 1200 : 300)
  if (out.website && validateWebsite) {
    const u = new URL(/^https?:\/\//i.test(out.website) ? out.website : `https://${out.website}`)
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) throw new Error('Enter a public business website, or leave it blank.')
    out.website = u.toString()
  }
  return out
}
export function saveOnboarding(db, { profile, step, dismiss = false } = {}) {
  const current = getSetting(db, KEY, {})
  const next = { ...current, ...(profile ? { profile: cleanProfile(profile, { validateWebsite: false }) } : {}), step: Number.isInteger(step) ? Math.max(0, Math.min(5, step)) : current.step || 0, ...(dismiss ? { dismissedAt: new Date().toISOString() } : {}) }
  setSetting(db, KEY, next)
  return onboardingStatus(db)
}
export function finishOnboarding(db, { profile, createFirstCampaign = false } = {}) {
  const clean = cleanProfile(profile)
  if (!clean.company || !clean.offer || !clean.audience) throw new Error('Add your business name, what you offer and who you help.')
  db.exec('BEGIN IMMEDIATE')
  try {
    const previous = getSetting(db, KEY, {})
    let campaignId = previous.campaignId && getCampaign(db, previous.campaignId) ? previous.campaignId : null
    let businessId = previous.businessId || (campaignId ? getCampaign(db,campaignId)?.business_id : null)
    if (businessId && getBusiness(db,businessId)) updateBusiness(db,businessId,{name:clean.company,profile:clean})
    else businessId = createBusiness(db,{name:clean.company,profile:clean}).id
    if (createFirstCampaign && !campaignId) campaignId = createCampaign(db, { business_id: businessId, name: `${clean.company} — first opportunities`, offer: clean.offer, source_url: clean.website || undefined, icp: { locations: clean.location ? [clean.location] : [], notes: `Audience: ${clean.audience}\nBusiness type: ${clean.kind}\nGoal: ${clean.goal}` } }).id
    setSetting(db, KEY, { ...previous, profile: clean, step: 5, businessId, campaignId, completedAt: new Date().toISOString() })
    db.exec('COMMIT')
    return onboardingStatus(db)
  } catch (e) { db.exec('ROLLBACK'); throw e }
}
