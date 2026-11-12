// Operator-only reconciliation. Run with service stopped, after checking the provider dashboard.
import {readFileSync} from 'node:fs'
import {Store} from './store.mjs'
import {config} from './config.mjs'
const [jobId,receiptFile]=process.argv.slice(2)
if(!jobId||!receiptFile)throw Error('Usage: node --env-file-if-exists=.env reconcile.mjs <job-id> <receipt.json>')
const receipt=JSON.parse(readFileSync(receiptFile,'utf8')),s=new Store(config().database)
try{
 const row=s.db.prepare('select user_id from jobs where id=?').get(jobId)
 if(!row)throw Error('Unknown job.')
 const job=s.job(row.user_id,jobId),q=s.getQuote(row.user_id,job.quote_id)
 if(job.state!=='review')throw Error('Only jobs awaiting review can be reconciled.')
 if(typeof receipt.reason!=='string'||receipt.reason.length<15||receipt.reason.length>500)throw Error('Include a concise provider reconciliation reason, without credentials.')
 if(!Array.isArray(receipt.results)||receipt.results.length>q.items.length)throw Error('Invalid results.')
 const refs=new Set()
 for(const r of receipt.results){if(!q.items.some(i=>i.client_ref===r.client_ref)||refs.has(r.client_ref))throw Error('Unknown or repeated result reference.');refs.add(r.client_ref)}
 if(!Number.isSafeInteger(receipt.charged)||receipt.charged<0||receipt.charged>job.credits)throw Error('Charge must be within the approved maximum.')
 s.settle(row.user_id,jobId,receipt.charged,receipt.results,'complete',`Operator reconciled: ${receipt.reason}`)
 console.log(JSON.stringify({job_id:jobId,state:'complete',charged:receipt.charged}))
}finally{s.close()}
