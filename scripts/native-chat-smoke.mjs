// One real Claude Code or Codex turn, isolated fixture data, no web/provider calls or sends.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { findHarnesses } from '../src/service/harness.js'
import { startChatTurn } from '../src/service/agentchat.js'
import * as core from '../src/core/index.js'
const engine = process.argv[2] || 'claude'
const exe = findHarnesses()[engine]
assert.ok(exe, `${engine} is not installed`)
const data = mkdtempSync(join(tmpdir(),'iv-native-chat-'))
const db = core.openDb(join(data,'fitscout.db'))
const campaign = core.createCampaign(db,{name:'Native research fixture',offer:'Booking systems',icp:{industries:['Plumbing'],locations:['Columbus, OH']}})
const lead = core.addLeads(db,campaign.id,[{company:'Fictional Plumbing',website:'https://plumber.test',source:'manual'}]).added[0]
const steps=[]
const turn = startChatTurn({engine,exe,dir:join(data,'chat'),
  mcp:{command:process.execPath,args:[resolve('src/mcp/server.js')],env:{FITSCOUT_DATA_DIR:data}},
  context:{page:'leads',campaignId:campaign.id,campaignName:campaign.name},
  message:`This is an isolated developer fixture test, not real research. Only call fitscout_research_plan for campaign ${campaign.id}, count 5, then fitscout_save_research for existing lead ${lead}. Fixture facts: https://plumber.test/services lists residential plumbing. Record that observation with that URL, fit score 75, fit reason that service category matches but needs are unknown, potential opportunity to discuss booking workflow, medium confidence, unknowns Budget and Current CRM. Use the supplied fictional facts only, no web or provider calls, do not create any leads/drafts or send. Then briefly confirm.`,
  onEvent:e=>{if(e.type==='step'){steps.push(e.tool);console.log(e.label)}if(e.type==='problem')console.log(e.text)},
})
const result=await turn.promise
try {
  assert.equal(result.ok,true,result.error)
  const saved=core.getLead(db,lead)
  assert.ok(saved.research?.evidence.length)
  assert.equal(saved.research.buying_intent,'unconfirmed')
  assert.equal(core.listMessages(db,{}).length,0)
  assert.ok(steps.some(x=>x.includes('research_plan')))
  assert.ok(steps.some(x=>x.includes('save_research')))
  const report={engine,passed:true,steps,fit_score:saved.fit_score,no_messages:true,session:!!result.session}
  mkdirSync('docs/verification/iv-native',{recursive:true})
  writeFileSync(`docs/verification/iv-native/${engine}-smoke.json`,JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally {db.close()}
