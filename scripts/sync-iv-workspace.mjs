// Keep the versioned local contract and UI identical in explicitly supplied IV app worktrees.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
const files = ['src/service/iv-workspace.js','src/service/iv-workspace-host.js','src/renderer/src/components/IVWorkspace.jsx','src/renderer/src/components/IVWorkspace.css']
const targets = process.argv.slice(2)
if (!targets.length) throw Error('Pass the Studio and/or Signal source directories.')
for (const target of targets) {
  const root = resolve(target), pkg = JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
  if (!['iv-studio','iv-signal'].includes(pkg.name)) throw Error('Target must be an IV app source checkout.')
  for (const file of files) { const dest=join(root,file);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(file),dest) }
  console.log(`Synced workspace contract v1 to ${pkg.name}`)
}
