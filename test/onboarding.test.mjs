import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
import { onboardingStatus, saveOnboarding, finishOnboarding } from '../src/service/onboarding.js'
const profile = { company: 'Fictional Co', offer: 'Booking websites', audience: 'Local businesses', website: 'example.test', location: 'Ohio', kind: 'Agency / consultant', goal: 'partners' }

test('onboarding resumes a local draft, finishes idempotently and never enables sending', () => {
  const db = core.openDb(':memory:')
  try {
    assert.equal(onboardingStatus(db).showOnLaunch, true)
    saveOnboarding(db, { profile, step: 3, dismiss: true })
    assert.equal(onboardingStatus(db).step, 3)
    assert.equal(onboardingStatus(db).showOnLaunch, false)
    const sender = core.getSender(db), mailbox = core.getMailbox(db)
    const done = finishOnboarding(db, { profile, createFirstCampaign: true })
    assert.equal(finishOnboarding(db, { profile, createFirstCampaign: true }).campaignId, done.campaignId)
    assert.equal(core.listCampaigns(db).length, 1)
    assert.equal(core.getCampaign(db, done.campaignId).source_url, 'https://example.test/')
    assert.equal(core.listMessages(db, {}).length, 0)
    assert.deepEqual(core.getSender(db), sender)
    assert.deepEqual(core.getMailbox(db), mailbox)
    assert.equal(onboardingStatus(db).showOnLaunch, false)
  } finally { db.close() }
})

test('onboarding protects existing campaigns and leaves invalid setup untouched', () => {
  const db = core.openDb(':memory:')
  try {
    const campaign = core.createCampaign(db, { name: 'Existing campaign', offer: 'Keep this offer' })
    assert.equal(onboardingStatus(db).showOnLaunch, false)
    assert.throws(() => finishOnboarding(db, { profile: { ...profile, audience: '' }, createFirstCampaign: true }), /who you help/)
    assert.throws(() => finishOnboarding(db, { profile: { ...profile, website: 'https://user:pass@example.test' } }), /public business website/)
    saveOnboarding(db, { profile: { ...profile, website: 'unfinished website' }, dismiss: true })
    assert.equal(onboardingStatus(db).profile.website, 'unfinished website')
    assert.equal(onboardingStatus(db).completedAt, undefined)
    finishOnboarding(db, { profile, createFirstCampaign: false })
    assert.deepEqual(core.getCampaign(db, campaign.id), campaign)
    assert.equal(core.listCampaigns(db).length, 1)
  } finally { db.close() }
})
