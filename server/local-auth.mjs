import {timingSafeEqual} from 'node:crypto'
import {fail} from './store.mjs'
// A private single-PC TEST identity, never a public/production authentication fallback.
export class LocalTestAuth {
 constructor(config,device){if(!config.localTest||config.live||config.host!=='127.0.0.1'||!/^\w{64}$/.test(device.token)||!device.user_id)throw Error('Local test identity is not valid.');this.device=device}
 check(value){const got=Buffer.from(String(value||'')),want=Buffer.from(this.device.token);if(got.length!==want.length||!timingSafeEqual(got,want))fail('Connect this PC from Premium settings.',401)}
 async authenticate(header){if(!header?.startsWith('Bearer '))fail('Connect this PC first.',401);this.check(header.slice(7));return {id:this.device.user_id,email:'local-test@iv-outreach.test'}}
 async refresh(token){this.check(token);return {access_token:this.device.token,refresh_token:this.device.token,expires_at:Math.floor(Date.now()/1000)+3600,email:'local-test@iv-outreach.test'}}
 async start(){fail('This local test uses device sign-in, not email.',400)}
 async verify(){fail('This local test uses device sign-in, not email.',400)}
}
