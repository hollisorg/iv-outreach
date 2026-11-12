// Compare every pre-upgrade database column and saved chat without printing private records.
import { DatabaseSync } from 'node:sqlite'
import { existsSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,readdirSync } from 'node:fs'
import { join,resolve,dirname } from 'node:path'
import { createHash } from 'node:crypto'
const profile=join(process.env.APPDATA,'Fitscout'),report=resolve('docs/verification/iv-businesses/upgrade-0.8.0.json')
const hash=value=>createHash('sha256').update(value).digest('hex')
const quote=value=>'"'+value.replaceAll('"','""')+'"'
const chatFiles=()=>existsSync(join(profile,'chats'))?readdirSync(join(profile,'chats'),{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(profile,'chats',d.name,'chat.json'))).map(d=>join('chats',d.name,'chat.json')).sort():[]
function snapshot(previous) {
  const db=new DatabaseSync(join(profile,'fitscout.db'),{readOnly:true})
  try {
    const names=previous?Object.keys(previous.tables):db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name!='schema_version' order by name").all().map(r=>r.name)
    const tables=Object.fromEntries(names.map(name=>{
      const columns=previous?.tables[name].columns || db.prepare(`pragma table_info(${quote(name)})`).all().map(c=>c.name)
      const rows=db.prepare(`select ${columns.map(quote).join(',')} from ${quote(name)} order by rowid`).all()
      return [name,{columns,rows:rows.length,sha256:hash(JSON.stringify(rows))}]
    }))
    return {schema:db.prepare('select version from schema_version').get().version,tables,chats:Object.fromEntries(chatFiles().map(f=>[f,hash(readFileSync(join(profile,f)))])),foreignKeyErrors:db.prepare('pragma foreign_key_check').all().length}
  } finally {db.close()}
}
mkdirSync(dirname(report),{recursive:true})
if(process.argv[2]==='backup') {
  if(existsSync(report)) throw new Error('Backup receipt already exists; preserve it before making another backup.')
  const backup=join(profile,'backups',`pre-businesses-0.8.0-${Date.now()}`);mkdirSync(backup,{recursive:true})
  for(const name of ['fitscout.db','fitscout.db-wal','fitscout.db-shm','app-settings.json','premium-jobs.json',...chatFiles()]) if(existsSync(join(profile,name))) { const target=join(backup,name);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(profile,name),target) }
  const before=snapshot();writeFileSync(report,JSON.stringify({backup,before},null,2));console.log(JSON.stringify({backup,schema:before.schema,leads:before.tables.leads.rows,messages:before.tables.messages.rows}))
} else {
  const receipt=JSON.parse(readFileSync(report,'utf8'));receipt.after=snapshot(receipt.before)
  receipt.preserved=JSON.stringify(receipt.before.tables)===JSON.stringify(receipt.after.tables)&&JSON.stringify(receipt.before.chats)===JSON.stringify(receipt.after.chats)
  receipt.passed=receipt.preserved&&receipt.after.schema===6&&receipt.after.foreignKeyErrors===0
  writeFileSync(report,JSON.stringify(receipt,null,2));console.log(JSON.stringify({passed:receipt.passed,preserved:receipt.preserved,schema:receipt.after.schema,leads:receipt.after.tables.leads.rows,messages:receipt.after.tables.messages.rows}));if(!receipt.passed)process.exitCode=1
}
