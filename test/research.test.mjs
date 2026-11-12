import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'

function fixture() {
  const db = core.openDb(':memory:')
  const campaign = core.createCampaign(db, { name: 'Fictional trial', offer: 'Booking workflows', icp: { industries: ['Plumbing'], locations: ['Columbus, OH'], exclusions: ['Franchises'] } })
  const lead = core.addLeads(db, campaign.id, [{ company: 'Example Plumbing', website: 'https://plumber.test', source_url: 'https://plumber.test', notes: 'Keep my note' }]).added[0]
  const input = { lead_id: lead, fit_score: 76, fit_reason: 'Service category matches; operational need remains unconfirmed.', opportunity: 'Discuss how booking requests reach the team.', confidence: 'medium', unknowns: ['Budget', 'Current CRM'], evidence: [{ url: 'https://plumber.test/services', observation: 'The provided fictional fixture lists residential plumbing.' }] }
  return { db, campaign, lead, input }
}
test('native research plans are bounded, expose existing prospects, and require no provider setup', () => {
  const f = fixture()
  try {
    const plan = core.researchPlan(f.db, { campaign_id: f.campaign.id, count: 5 })
    assert.equal(plan.budget.provider_credits, 0)
    assert.equal(plan.budget.max_candidates, 10)
    assert.ok(plan.queries.includes('Plumbing Columbus, OH'))
    assert.equal(plan.existing_businesses[0].domain, 'plumber.test')
    for (const count of [0,26,2.5]) assert.throws(()=>core.researchPlan(f.db,{campaign_id:f.campaign.id,count}))
    core.updateCampaign(f.db,f.campaign.id,{status:'archived'})
    assert.throws(()=>core.researchPlan(f.db,{campaign_id:f.campaign.id}),/active/)
    assert.equal(core.listMessages(f.db,{}).length,0)
  } finally { f.db.close() }
})
test('native evidence preserves contact history and clearly separates observations from opportunity', () => {
  const f = fixture()
  try {
    const draft = core.saveDrafts(f.db,[{lead_id:f.lead,channel:'email',subject:'Fixture',body:'Unsent draft'}])[0]
    const saved = core.saveResearch(f.db,f.input)
    assert.equal(saved.research.buying_intent,'unconfirmed')
    const lead=core.getLead(f.db,f.lead)
    assert.equal(lead.notes,'Keep my note')
    assert.equal(lead.email,null)
    assert.equal(lead.research.evidence[0].url,'https://plumber.test/services')
    assert.equal(lead.messages[0].id,draft.message_id)
    assert.equal(lead.messages[0].status,'draft')
    assert.equal(lead.rank_score,45.6)
    core.saveResearch(f.db,{...f.input,opportunity:'Updated discussion idea'})
    assert.equal(f.db.prepare('select count(*) n from lead_research').get().n,1)
  } finally { f.db.close() }
})
test('invalid evidence fails before scoring or writing and suppression prevents research', () => {
  const f=fixture()
  try {
    for (const url of ['file:///C:/secret','javascript:alert(1)','http://localhost/x','https://127.0.0.1','https://user:pass@plumber.test']) {
      assert.throws(()=>core.saveResearch(f.db,{...f.input,evidence:[{url,observation:'x'}]}),/public/)
    }
    assert.throws(()=>core.saveResearch(f.db,{...f.input,evidence:[{url:'https://unrelated.test',observation:'x'}]}),/own website/)
    assert.equal(core.getLead(f.db,f.lead).fit_score,null)
    assert.equal(core.getLead(f.db,f.lead).research,null)
    core.updateLead(f.db,f.lead,{status:'suppressed'})
    assert.throws(()=>core.saveResearch(f.db,f.input),/do-not-contact/)
  } finally { f.db.close() }
})
