export function config(env=process.env){
  const integer=(key,fallback,min=0)=>{const n=Number(env[key]??fallback);if(!Number.isSafeInteger(n)||n<min)throw new Error(`Invalid ${key}`);return n}
  const live=env.IV_BILLING_LIVE==='true'
  if(env.STRIPE_SECRET_KEY && !(live?/^(sk|rk)_live_/:/^(sk|rk)_test_/).test(env.STRIPE_SECRET_KEY))throw new Error('Stripe key does not match configured mode.')
  const localTest=env.IV_LOCAL_TEST==='true'
  if(localTest&&(live||(env.HOST&&env.HOST!=='127.0.0.1')))throw new Error('Local test authentication requires test billing and loopback binding.')
  const origin=env.IV_PUBLIC_URL||'http://127.0.0.1:4319'
  const u=new URL(origin);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||(!['127.0.0.1','localhost'].includes(u.hostname)&&u.protocol!=='https:'))throw new Error('Set a secure IV_PUBLIC_URL origin.')
  if(localTest&&(u.origin!=='http://127.0.0.1:4319'||integer('PORT',4319,1)!==4319))throw new Error('Local test service must use its fixed loopback origin.')
  return {live,localTest,portalConfig:env.STRIPE_PORTAL_CONFIG_ID||'',origin:u.origin,port:integer('PORT',4319,1),host:env.HOST||'127.0.0.1',database:env.IV_BILLING_DB||'./data/premium.db',
    stripeKey:env.STRIPE_SECRET_KEY||'',webhookSecret:env.STRIPE_WEBHOOK_SECRET||'',account:env.STRIPE_ACCOUNT_ID||'',
    premiumPrice:env.STRIPE_PREMIUM_PRICE_ID||'',topupPrice:env.STRIPE_TOPUP_PRICE_ID||'',premiumCredits:integer('IV_MONTHLY_CREDITS',500,1),topupCredits:integer('IV_TOPUP_CREDITS',100,1),premiumCents:integer('IV_PREMIUM_CENTS',4900,1),topupCents:integer('IV_TOPUP_CENTS',1000,1),
    supabaseUrl:env.SUPABASE_URL||'',supabaseKey:env.SUPABASE_ANON_KEY||'',
    providerBudget:integer('IV_PROVIDER_MONTHLY_BUDGET_MICROS',0),providersApproved:env.IV_PROVIDER_CONTRACTS_APPROVED==='true',
    bouncerKey:env.BOUNCER_API_KEY||'',betterContactKey:env.BETTERCONTACT_API_KEY||'',
  }
}
