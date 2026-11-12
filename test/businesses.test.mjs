import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as core from '../src/core/index.js'
import { MIGRATIONS } from '../src/core/db.js'
import { contextLine } from '../src/service/agentchat.js'

test('schema 5 upgrade preserves campaign, lead, message and reply fields and assigns a business', () => {
  const file = join(mkdtempSync(join(tmpdir(),'iv-business-migration-')), 'old.db')
  let db = new DatabaseSync(file)
  db.exec('create table schema_version(version integer); insert into schema_version values(5)')
  for (const migration of MIGRATIONS.slice(0,5)) db.exec(migration)
  db.exec(`insert into campaigns(id,name,created_at,updated_at) values('c','Existing','2026','2026');
    insert into leads(id,campaign_id,company,created_at,updated_at) values('l','c','Fictional prospect','2026','2026');
    insert into messages(id,lead_id,campaign_id,channel,body,status,created_at,updated_at) values('m','l','c','linkedin','Hello','sent','2026','2026');
    insert into replies(id,lead_id,message_id,channel,received_at,created_at) values('r','l','m','linkedin','2026','2026')`)
  core.setSetting(db,'iv_onboarding_v1',{profile:{company:'Fictional brand',offer:'Websites'}})
  const tables=['campaigns','leads','messages','replies','settings']
  const before=Object.fromEntries(tables.map(t=>[t,db.prepare(`select * from ${t}`).all()]))
  db.close(); db=core.openDb(file)
  try {
    for (const table of tables) {
      const rows=db.prepare(`select ${Object.keys(before[table][0]).map(c=>`"${c}"`).join(',')} from ${table}`).all()
      assert.deepEqual(rows,before[table])
    }
    assert.equal(core.listBusinesses(db)[0].name,'Fictional brand')
    assert.equal(core.getCampaign(db,'c').business_id,'legacy-business')
    assert.deepEqual(db.prepare('pragma foreign_key_check').all(),[])
    assert.throws(()=>db.exec("update campaigns set business_id=null where id='c'"),/needs a business/)
  } finally { db.close() }
})

test('business ownership scopes campaigns and moving a campaign preserves its leads and messages', () => {
  const db=core.openDb(':memory:')
  try {
    const a=core.createBusiness(db,{name:'Brand A'}), b=core.createBusiness(db,{name:'Brand B'})
    assert.throws(()=>core.createCampaign(db,{name:'Ambiguous'}),/business_id/)
    assert.throws(()=>core.createCampaign(db,{name:'Invalid',business_id:'missing'}),/existing business/)
    const c=core.createCampaign(db,{name:'Partners',business_id:a.id})
    const {added:[lead]}=core.addLeads(db,c.id,[{company:'Fictional firm',website:'example.test'}])
    core.saveDrafts(db,[{lead_id:lead,channel:'email',subject:'Hello',body:'A draft'}])
    assert.equal(core.overview(db,{business_id:a.id}).drafts_waiting_approval,1)
    assert.equal(core.overview(db,{business_id:b.id}).drafts_waiting_approval,0)
    const before=db.prepare('select * from leads').all(), messages=db.prepare('select * from messages').all()
    core.updateCampaign(db,c.id,{business_id:b.id,name:'Moved partners'})
    assert.equal(core.listCampaigns(db,{business_id:a.id}).length,0)
    assert.equal(core.listCampaigns(db,{business_id:b.id})[0].id,c.id)
    assert.deepEqual(db.prepare('select * from leads').all(),before)
    assert.deepEqual(db.prepare('select * from messages').all(),messages)
    assert.equal(core.overview(db,{business_id:b.id}).drafts_waiting_approval,1)
    assert.throws(()=>core.updateCampaign(db,c.id,{business_id:null}),/existing business/)
  } finally {db.close()}
})

test('social queues filter by business before applying the shared daily cap', () => {
  const db=core.openDb(':memory:')
  try {
    core.saveSender(db,{name:'Fictional sender',company:'Example',postal_address:'1 Example St',reply_email:'sender@example.test',daily_linkedin_cap:1})
    const ids=[]
    for (const name of ['Brand A','Brand B']) {
      const b=core.createBusiness(db,{name}),c=core.createCampaign(db,{name:'Partners',business_id:b.id})
      const {added:[lead]}=core.addLeads(db,c.id,[{company:name,linkedin_url:`https://linkedin.com/in/${b.id}`}])
      const [draft]=core.saveDrafts(db,[{lead_id:lead,channel:'linkedin',body:'Hello, a fictional test note.'}])
      assert.equal(core.approveMessages(db,[draft.message_id])[0].approved,true)
      ids.push({business:b.id,message:draft.message_id})
    }
    assert.equal(core.socialQueue(db,{business_id:ids[1].business}).items[0].message_id,ids[1].message)
    core.markSent(db,ids[0].message)
    assert.equal(core.socialQueue(db,{business_id:ids[1].business}).items.length,0)
  } finally { db.close() }
})

test('agent context includes selected business, campaign and brand voice', () => {
  const context=contextLine({page:'leads',businessId:'b',businessName:'Brand B',campaignId:'c',businessBrief:{offer:'Booking websites',voice:'Friendly and concise'}})
  assert.match(context,/Brand B/); assert.match(context,/id b/); assert.match(context,/Booking websites/); assert.match(context,/Friendly and concise/)
})
