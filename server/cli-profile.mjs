import {existsSync,readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'

// The test Stripe account and prices for the local Premium backend live in server/local-test.json (git-ignored),
// e.g. {"account":"acct_…","premiumPrice":"price_…","topupPrice":"price_…"}. Environment variables win.
export function localTestIds(file=join(dirname(fileURLToPath(import.meta.url)),'local-test.json')){
 const saved=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{}
 return {account:process.env.STRIPE_ACCOUNT_ID||saved.account||'',premiumPrice:process.env.STRIPE_PREMIUM_PRICE_ID||saved.premiumPrice||'',topupPrice:process.env.STRIPE_TOPUP_PRICE_ID||saved.topupPrice||''}
}
export function readTestProfile(file=join(homedir(),'.config','stripe','config.toml'),profile='iv-outreach-test',expectedAccount=localTestIds().account){
 let active=false;const values={}
 for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
  const section=line.match(/^\[([^\]]+)\]\s*$/);if(section){active=section[1]===profile;continue}
  if(!active)continue
  const m=line.match(/^\s*(account_id|test_mode_api_key)\s*=\s*(".*"|'.*')\s*$/)
  if(m)values[m[1]]=m[2].startsWith("'")?m[2].slice(1,-1):JSON.parse(m[2])
 }
 if(!/^acct_/.test(values.account_id||'')||(expectedAccount&&values.account_id!==expectedAccount)||!/^(rk|sk)_test_/.test(values.test_mode_api_key||''))throw Error('Sign in to the iv-outreach-test Stripe CLI profile first.')
 return {account:values.account_id,key:values.test_mode_api_key}
}
