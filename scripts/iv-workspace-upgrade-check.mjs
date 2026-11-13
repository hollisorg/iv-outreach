// Private backups and hash-only receipts; never print native profile contents.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { dataLocation } from '../.runtime/iv-connect/studio/src/service/paths.js'
const roaming=process.env.APPDATA
if(!roaming)throw Error('Run this Windows upgrade check from the account that owns the IV apps.')
const profiles={outreach:join(roaming,'Fitscout'),signal:join(roaming,'IV Signal'),studio:dataLocation({env:{APPDATA:roaming},execPath:join(roaming,'..','Local','Programs','IV Studio','IV Studio.exe'),platform:'win32'}).dir}
const report=resolve('docs/verification/iv-workspace/upgrade.json'),hash=x=>createHash('sha256').update(x).digest('hex'),quote=x=>'"'+x.replaceAll('"','""')+'"'
const walk=(root,base='')=>existsSync(join(root,base))?readdirSync(join(root,base),{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(root,join(base,d.name)):[join(base,d.name)]):[]
const records=id=>id==='studio'?['characters.json',...['projects','productions','sequences','edits','images','music','voices','rebuild','reframes','remake','sizzle','trainings'].flatMap(d=>walk(profiles[id],d).filter(f=>f.endsWith('.json')))]:walk(profiles[id],'chats').filter(f=>f.endsWith('chat.json'))
function snapshot(id,old){
 const root=profiles[id],files=Object.fromEntries((old?Object.keys(old.files):records(id)).filter(f=>!old||existsSync(join(root,f))).filter(f=>existsSync(join(root,f))).map(f=>[f,hash(readFileSync(join(root,f)))]));
 if(id==='studio')return {files}
 const db=new DatabaseSync(join(root,id==='outreach'?'fitscout.db':'signal.db'),{readOnly:true})
 try {const names=old?Object.keys(old.tables):db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name!='schema_version' order by name").all().map(r=>r.name)
 const tables=Object.fromEntries(names.map(name=>{const columns=old?.tables[name].columns||db.prepare(`pragma table_info(${quote(name)})`).all().map(c=>c.name);const rows=db.prepare(`select ${columns.map(quote).join(',')} from ${quote(name)} order by rowid`).all();return [name,{columns,rows:rows.length,sha256:hash(JSON.stringify(rows))}]}));return {files,tables,schema:db.prepare('select version from schema_version').get().version,foreignKeyErrors:db.prepare('pragma foreign_key_check').all().length}
 }finally{db.close()}
}
mkdirSync(dirname(report),{recursive:true})
if(process.argv[2]==='backup'){
 if(existsSync(report))throw Error('Existing receipt must be preserved.')
 const receipt={before:{},backups:{}}
 for(const id of Object.keys(profiles)){
  const root=profiles[id],backup=join(root,'backups',`pre-iv-workspace-${Date.now()}`);mkdirSync(backup,{recursive:true});receipt.backups[id]=backup
  const names=new Set([...records(id),...readdirSync(root).filter(n=>/\.(json|db)(-wal|-shm)?$/.test(n)),...(id!=='studio'?walk(root,'brand-assets'):[])])
  for(const name of names)if(existsSync(join(root,name))){const dest=join(backup,name);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(root,name),dest)}
  receipt.before[id]=snapshot(id)
 }
 writeFileSync(report,JSON.stringify(receipt,null,2));console.log(JSON.stringify({backups:receipt.backups,records:Object.fromEntries(Object.entries(receipt.before).map(([id,s])=>[id,{files:Object.keys(s.files).length,schema:s.schema}]))}))
}else{
 const r=JSON.parse(readFileSync(report,'utf8'));r.after=Object.fromEntries(Object.keys(profiles).map(id=>[id,snapshot(id,r.before[id])]))
 r.preserved=Object.fromEntries(Object.keys(profiles).map(id=>[id,JSON.stringify(r.before[id].files)===JSON.stringify(r.after[id].files)&&JSON.stringify(r.before[id].tables)===JSON.stringify(r.after[id].tables)]))
 r.passed=Object.values(r.preserved).every(Boolean)&&Object.values(r.after).every(s=>!s.foreignKeyErrors);writeFileSync(report,JSON.stringify(r,null,2));console.log(JSON.stringify({passed:r.passed,preserved:r.preserved,schemas:Object.fromEntries(Object.entries(r.after).map(([id,s])=>[id,s.schema]))}));if(!r.passed)process.exitCode=1
}
