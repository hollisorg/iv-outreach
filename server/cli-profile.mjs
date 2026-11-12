import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
export function readTestProfile(file=join(homedir(),'.config','stripe','config.toml'),profile='iv-outreach-test'){
 let active=false;const values={}
 for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
  const section=line.match(/^\[([^\]]+)\]\s*$/);if(section){active=section[1]===profile;continue}
  if(!active)continue
  const m=line.match(/^\s*(account_id|test_mode_api_key)\s*=\s*(".*"|'.*')\s*$/)
  if(m)values[m[1]]=m[2].startsWith("'")?m[2].slice(1,-1):JSON.parse(m[2])
 }
 if(values.account_id!=='acct_1L9wOnADnzKPQPbv'||!/^(rk|sk)_test_/.test(values.test_mode_api_key||''))throw Error('Sign in to the Hollis test Stripe CLI profile first.')
 return {account:values.account_id,key:values.test_mode_api_key}
}
