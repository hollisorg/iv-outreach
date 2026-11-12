// Backup and compare the existing profile around the installer. No contact data is printed.
import {DatabaseSync} from 'node:sqlite'
import {existsSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
const profile=join(process.env.APPDATA,'Fitscout'),report=resolve('docs/verification/iv-onboarding/upgrade-0.7.0.json')
mkdirSync(resolve('docs/verification/iv-onboarding'),{recursive:true})
const chatFiles=()=>existsSync(join(profile,'chats'))?readdirSync(join(profile,'chats'),{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(profile,'chats',d.name,'chat.json'))).map(d=>join('chats',d.name,'chat.json')).sort():[]
const snapshot=()=>{const db=new DatabaseSync(join(profile,'fitscout.db'),{readOnly:true});try{
 const tables=db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all()
 return {chats:Object.fromEntries(chatFiles().map(f=>[f,createHash('sha256').update(readFileSync(join(profile,f))).digest('hex')])),schema:db.prepare('select version from schema_version').get().version,leads:db.prepare('select count(*) n from leads').get().n,messages:db.prepare('select count(*) n from messages').get().n,tables:Object.fromEntries(tables.map(({name})=>{const rows=db.prepare(`select * from "${name.replaceAll('"','""')}" order by rowid`).all();return [name,{rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}] }))}
 }finally{db.close()}}
if(process.argv[2]==='backup'){
 const backup=join(profile,'backups',`pre-onboarding-0.7.0-${Date.now()}`);mkdirSync(backup,{recursive:true})
 for(const name of ['fitscout.db','fitscout.db-wal','fitscout.db-shm','app-settings.json','premium-jobs.json'])if(existsSync(join(profile,name)))copyFileSync(join(profile,name),join(backup,name))
 for(const name of chatFiles()){const target=join(backup,name);mkdirSync(join(backup,name,'..'),{recursive:true});copyFileSync(join(profile,name),target)}
 const before=snapshot();writeFileSync(report,JSON.stringify({backup,before},null,2));console.log(JSON.stringify({backup,leads:before.leads,messages:before.messages,schema:before.schema}))
}else{
 const value=JSON.parse(readFileSync(report,'utf8'));value.after=snapshot();value.unchanged=JSON.stringify(value.before)===JSON.stringify(value.after);writeFileSync(report,JSON.stringify(value,null,2));console.log(JSON.stringify({unchanged:value.unchanged,leads:value.after.leads,messages:value.after.messages,schema:value.after.schema}));if(!value.unchanged)process.exitCode=1
}
