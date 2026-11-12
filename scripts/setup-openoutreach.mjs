// Exercise the same managed installer used by Settings, in an explicitly supplied data folder.
import { resolve } from 'node:path'
import { OpenOutreachRuntime } from '../src/service/openoutreach.js'
if (!process.argv[2]) throw new Error('Supply a dedicated data directory for engine setup.')
const dataDir = resolve(process.argv[2])
let last = ''
const runtime = new OpenOutreachRuntime({ dataDir, vendorDir: resolve('vendor'), getDb: () => { throw new Error('Setup must not open the campaign database') }, getConfig: () => ({}), onChange: () => {
  const state = runtime.installState
  if (state.message !== last) { last = state.message; console.log(state.message) }
} })
runtime.install()
await runtime.installPromise
console.log(JSON.stringify({ ...runtime.status(), dataDir }))
if (runtime.installState.status !== 'done') process.exitCode = 1
