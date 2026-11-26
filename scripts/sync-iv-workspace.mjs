// Keep the versioned local contract and UI identical in explicitly supplied IV app worktrees.
//   node scripts/sync-iv-workspace.mjs <iv-studio> <iv-signal> <iv-hivemind>
// IV Studio and IV Signal get the files below at the same paths. IV Hivemind keeps its copies in shared/ and lists
// them itself (scripts/shared-files.mjs there), so its list is used for it.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const files = ['src/service/iv-workspace.js','src/service/iv-workspace-host.js','src/renderer/src/components/IVWorkspace.jsx','src/renderer/src/components/IVWorkspace.css','src/renderer/src/components/HivemindMark.jsx','src/renderer/src/components/HivemindMark.css','src/renderer/src/assets/hivemind-logo.png']
const targets = process.argv.slice(2)
if (!targets.length) throw Error('Pass the Studio, Signal and/or Hivemind source directories.')
for (const target of targets) {
  const root = resolve(target), pkg = JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
  if (!['iv-studio','iv-signal','iv-hivemind'].includes(pkg.name)) throw Error('Target must be an IV app source checkout.')
  if (pkg.name === 'iv-hivemind') {
    const list = join(root,'scripts','shared-files.mjs')
    if (!existsSync(list)) throw Error(`${list} is missing.`)
    const { SHARED } = await import(pathToFileURL(list).href)
    for (const [inHivemind, inOutreach] of SHARED) { if (!existsSync(resolve(inOutreach))) throw Error(`${inOutreach} isn't in this checkout.`); const dest=join(root,inHivemind);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(inOutreach),dest) }
    console.log(`Synced ${SHARED.length} shared files to iv-hivemind`)
    continue
  }
  for (const file of files) { const dest=join(root,file);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(file),dest) }
  console.log(`Synced workspace contract v1 to ${pkg.name}`)
}
