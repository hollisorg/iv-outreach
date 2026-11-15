import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {config} from '../server/config.mjs'
import {LocalTestAuth} from '../server/local-auth.mjs'
import {readTestProfile} from '../server/cli-profile.mjs'

test('local identity is restricted to test mode on the fixed loopback listener',async()=>{
 const device={token:'a'.repeat(64),user_id:'fictional-local-user'},c=config({IV_LOCAL_TEST:'true'}),auth=new LocalTestAuth(c,device)
 assert.throws(()=>config({IV_LOCAL_TEST:'true',IV_BILLING_LIVE:'true'}),/test billing/)
 assert.throws(()=>config({IV_LOCAL_TEST:'true',HOST:'0.0.0.0'}),/loopback/)
 assert.throws(()=>config({IV_LOCAL_TEST:'true',PORT:'4320'}),/fixed loopback/)
 assert.throws(()=>config({IV_LOCAL_TEST:'true',IV_PUBLIC_URL:'https://example.com'}),/fixed loopback/)
 assert.throws(()=>new LocalTestAuth(config({}),device),/not valid/)
 await assert.rejects(()=>auth.authenticate('Bearer wrong'),/Connect/)
 await assert.rejects(()=>auth.refresh('b'.repeat(64)),/Connect/)
 const session=await auth.refresh(device.token),user=await auth.authenticate('Bearer '+session.access_token)
 assert.equal(user.id,device.user_id);assert.equal(user.email,'local-test@iv-outreach.test')
 assert.match(config({STRIPE_SECRET_KEY:'rk_test_fixture'}).stripeKey,/rk_test/)
})

test('dedicated Stripe parser accepts CLI literal strings and never selects a live or default key',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'iv-profile-test-')),'config.toml')
 for(const quote of ["'",'"']){
  writeFileSync(file,`[default]\naccount_id = 'wrong'\ntest_mode_api_key = 'sk_test_wrong'\n[iv-outreach-test]\naccount_id = ${quote}acct_TESTFIXTURE${quote}\nlive_mode_api_key = 'sk_live_unused'\ntest_mode_api_key = ${quote}rk_test_fixture${quote}\n`)
  assert.deepEqual(readTestProfile(file,'iv-outreach-test','acct_TESTFIXTURE'),{account:'acct_TESTFIXTURE',key:'rk_test_fixture'})
  assert.throws(()=>readTestProfile(file,'iv-outreach-test','acct_OTHER'),/Sign in/)
 }
 writeFileSync(file,"[iv-outreach-test]\naccount_id = 'acct_TESTFIXTURE'\nlive_mode_api_key = 'sk_live_unused'\n")
 assert.throws(()=>readTestProfile(file,'iv-outreach-test','acct_TESTFIXTURE'),/Sign in/)
})
