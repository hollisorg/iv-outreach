import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/core/index.js'
test('business scanner saves reusable searches, records partial failures and does not fabricate fit',async()=>{
 const db=core.openDb(':memory:');try{
 const c=core.createCampaign(db,{name:'Scanner fixture',offer:'AI services',icp:{industries:['Hotels']}}),args={campaign_id:c.id,area:'Columbus, Ohio',categories:['hotels','salons'],limit:5}
 const saved=core.saveScan(db,args);assert.equal(core.scannerState(db,c.id).saved.length,1)
 let count=0;const r=await core.runScan(db,args,{search:async(_db,input)=>{assert.equal(input.limit,5);if(++count===2)throw Error('Fixture network outage');return {found:2,added:1,duplicates:1}}})
 assert.equal(r.state,'partial');assert.equal(r.results.length,1);assert.equal(r.provider_credits,0);assert.equal(core.scannerState(db,c.id).history.length,1)
 assert.equal(core.listMessages(db,{}).length,0);assert.equal(core.scannerState(db,c.id).running,undefined)
 core.removeScan(db,c.id,saved.id);assert.equal(core.scannerState(db,c.id).saved.length,0)
 await assert.rejects(()=>core.runScan(db,{...args,categories:['unknown']}),/categories/)
 await assert.rejects(()=>core.runScan(db,{...args,limit:100}),/1–20/)
 core.updateCampaign(db,c.id,{status:'archived'});await assert.rejects(()=>core.runScan(db,args),/active/)
 }finally{db.close()}
})
test('business scan lease blocks overlapping MCP/UI runs',async()=>{
 const db=core.openDb(':memory:');try{const c=core.createCampaign(db,{name:'Fixture',offer:'AI',icp:{industries:['Hotels']}}),args={campaign_id:c.id,area:'Ohio',categories:['hotels']};let done
 const pending=core.runScan(db,args,{search:()=>new Promise(r=>{done=r})});await assert.rejects(()=>core.runScan(db,args),/already running/);done({found:0,added:0,duplicates:0});await pending
 assert.equal(core.scannerState(db,c.id).history.length,1)
 }finally{db.close()}
})
