import { fail } from './store.mjs'
export class Auth {
  constructor(config,fetcher=fetch){this.c=config;this.fetch=fetcher
    if(config.supabaseUrl){const u=new URL(config.supabaseUrl);if(u.protocol!=='https:'||u.username||u.password)throw new Error('SUPABASE_URL must use HTTPS.')}
  }
  async request(path,body,token){
    if(!this.c.supabaseUrl||!this.c.supabaseKey)fail('Premium account sign-in is not connected yet.',503)
    const r=await this.fetch(`${this.c.supabaseUrl.replace(/\/$/,'')}/auth/v1/${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:this.c.supabaseKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})
    if(!r.ok)fail('Account verification failed. Check the code or sign in again.',401)
    return r.json()
  }
  async authenticate(header){if(typeof header!=='string'||!/^Bearer \S{20,8192}$/.test(header))fail('Sign in to Premium first.',401)
    const u=await this.request('user',null,header.slice(7));if(!u.id||!u.email||!u.email_confirmed_at||u.is_anonymous)fail('A verified email account is required.',401);return {id:u.id,email:u.email}
  }
  email(value){if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail('Enter a valid email address.');return value.trim().toLowerCase()}
  async start(email){await this.request('otp',{email:this.email(email),create_user:true});return {sent:true}}
  async verify(email,code){if(!/^\d{6,8}$/.test(String(code)))fail('Enter the code from your email.');return this.session(await this.request('verify',{email:this.email(email),token:String(code),type:'email'}))}
  async refresh(token){if(typeof token!=='string'||token.length<10||token.length>8192)fail('Sign in again.',401);return this.session(await this.request('token?grant_type=refresh_token',{refresh_token:token}))}
  session(s){if(!s.access_token||!s.refresh_token||!s.user?.email)fail('Sign in again.',401);return {access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600),email:s.user.email}}
}
