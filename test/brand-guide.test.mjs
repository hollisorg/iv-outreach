import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as core from '../src/core/index.js'
import {brandImage,importBrandImage} from '../src/service/brand-assets.js'
import {startUiBridge,uiBridge} from '../src/service/ui-guide.js'
import {guidePlaces,PLACES} from '../src/renderer/src/guides.js'
test('business artwork keeps valid local references and rejects paths or active URLs',()=>{
  const db=core.openDb(':memory:')
  try {
    const b=core.createBusiness(db,{name:'Fictional',profile:{logo_id:'a'.repeat(64)+'.png',cover_preset:'discovery',accent:'#91bfe4'}})
    core.updateBusiness(db,b.id,{profile:{offer:'Websites'}})
    assert.equal(core.getBusiness(db,b.id).profile.logo_id,b.profile.logo_id)
    for(const logo_id of ['../secret.png','file:///secret.png','https://example.test/a.png','data:image/svg+xml,<svg/>'])assert.throws(()=>core.updateBusiness(db,b.id,{profile:{logo_id}}),/image/)
    assert.throws(()=>core.updateBusiness(db,b.id,{profile:{accent:'red;url(evil)'}}),/color/)
  }finally{db.close()}
})
test('brand images are bounded, re-encoded and retained independently of source',()=>{
  const dir=mkdtempSync(join(tmpdir(),'iv-brand-')),file=join(dir,'logo.png');writeFileSync(file,'fixture')
  let dimensions
  const decoder={createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:1000,height:500}),resize:size=>{dimensions=size;return{toPNG:()=>Buffer.from('normalized image')}}})}
  const result=importBrandImage(dir,file,'logo',decoder)
  assert.equal(dimensions.width,256);assert.equal(dimensions.height,128)
  assert.ok(existsSync(join(dir,'brand-assets',result.id)))
  assert.equal(brandImage(dir,result.id),result.dataUrl)
  assert.equal(brandImage(dir,'../../secret'),null)
  assert.throws(()=>importBrandImage(dir,file,'other',decoder),/logo or cover/)
  const bad=join(dir,'bad.svg');writeFileSync(bad,'<svg/>');assert.throws(()=>importBrandImage(dir,bad,'logo',decoder),/PNG/)
  assert.throws(()=>importBrandImage(dir,file,'logo',{createFromBuffer:()=>({isEmpty:()=>true})}),/could not be read/)
})
test('visual bridge restricts origin, token, operations and in-app context',async()=>{
  const bridge=await startUiBridge({places:()=>guidePlaces(),inspect:()=>({title:'Fictional app'}),show:({place})=>{if(!Object.hasOwn(PLACES,place))throw Error('Unknown place');return {shown:true,place}}})
  const env={FITSCOUT_AGENT_RUN:'chat',FITSCOUT_UI_URL:bridge.url,FITSCOUT_UI_TOKEN:bridge.token}
  try {
    assert.equal((await fetch(`${bridge.url}/inspect`,{method:'POST'})).status,403)
    assert.equal((await fetch(`${bridge.url}/inspect`,{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,Origin:'https://example.test'}})).status,403)
    assert.ok((await uiBridge('places',{},env)).some(p=>p.id==='business_brand'))
    assert.equal((await uiBridge('show',{place:'mailbox'},env)).shown,true)
    await assert.rejects(()=>uiBridge('show',{place:'javascript:alert(1)'},env),/Unknown place/)
    await assert.rejects(()=>uiBridge('inspect',{}, {...env,FITSCOUT_AGENT_RUN:''}),/inside IV Outreach/)
    await assert.rejects(()=>uiBridge('shell',{},env),/Unknown/)
  }finally{bridge.close()}
})
