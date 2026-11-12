import { config } from './config.mjs'
import { Store } from './store.mjs'
import { Billing } from './billing.mjs'
import { Auth } from './auth.mjs'
import { Providers } from './providers.mjs'
import { createApp } from './app.mjs'
const c=config(),store=new Store(c.database),billing=new Billing(store,c)
await billing.validate()
store.recover()
const app=createApp({store,config:c,billing,auth:new Auth(c),providers:new Providers(c)})
app.server.listen(c.port,c.host,()=>console.log(`IV Outreach Premium backend listening on ${c.host}:${c.port} (${c.live?'LIVE':'TEST'} billing)`))
const timer=setInterval(()=>app.tick(),2000)
function stop(){clearInterval(timer);app.server.close(()=>{store.close();process.exit(0)});setTimeout(()=>process.exit(0),5000).unref()}
process.on('SIGTERM',stop);process.on('SIGINT',stop)
