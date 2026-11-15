import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APPS, handoffArgument, workspaceDir } from '../../../src/service/iv-workspace.js'

export function readWorkspace(root = workspaceDir()) {
  const path = join(root, 'workspace.db')
  if (!existsSync(path)) return { brands: [], handoffs: [], registrations: {}, links: {} }

  const db = new DatabaseSync(path, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout=1500')
    const meta = db.prepare('SELECT value FROM meta WHERE key = ?')
    if (JSON.parse(meta.get('version')?.value ?? 'null') !== 1) {
      throw new Error('This workspace needs a compatible version of Hivemind.')
    }

    const brands = db.prepare('SELECT value FROM brands ORDER BY rowid').all().map(row => JSON.parse(row.value))
    const handoffs = db.prepare('SELECT value FROM handoffs ORDER BY rowid DESC LIMIT 200').all()
      .map(row => JSON.parse(row.value))
      .filter(item => item.schema === 'iv.handoff.v1' && Object.hasOwn(APPS, item.target))
    const registrations = Object.fromEntries(Object.keys(APPS).map(id => [id, JSON.parse(meta.get(`app:${id}`)?.value ?? 'null')]))
    // Each app's own business IDs linked to a shared business: { outreach: { localId: brandId }, signal: {...} }.
    const links = {}
    for (const row of db.prepare('SELECT key, value FROM links').all()) {
      const [appId, , ...rest] = String(row.key).split(':')
      let value = null
      try { value = JSON.parse(row.value) } catch {}
      if (!Object.hasOwn(APPS, appId) || !rest.length || typeof value?.brandId !== 'string') continue
      ;(links[appId] ||= {})[rest.join(':')] = value.brandId
    }
    return { brands, handoffs, registrations, links }
  } finally {
    db.close()
  }
}

export function appStatus(id, programs, registrations) {
  if (!Object.hasOwn(APPS, id)) throw new Error('Unknown IV app.')
  const name = APPS[id]
  const executable = join(programs, name, `${name}.exe`)
  const installed = statSync(executable, { throwIfNoEntry: false })?.isFile() ?? false
  const record = registrations[id]
  const connected = installed && record?.protocol === 1 && typeof record.executable === 'string'
    && resolve(record.executable).toLowerCase() === resolve(executable).toLowerCase()
  return { id, name, executable, installed, connected }
}

// Other IV apps Hivemind can open. They don't take part in the shared workspace or handoffs; Hivemind only
// launches them from their standard per-user install folder.
export const TOOLS = { chat: 'IV Chat', voice: 'IV Voice', keys: 'IV Keys' }

export function toolStatus(id, programs) {
  if (!Object.hasOwn(TOOLS, id)) throw new Error('Unknown IV app.')
  const name = TOOLS[id]
  const executable = join(programs, name, `${name}.exe`)
  return { id, name, executable, installed: statSync(executable, { throwIfNoEntry: false })?.isFile() ?? false }
}

export async function openTool({ id, programs }) {
  const target = toolStatus(id, programs)
  if (!target.installed) throw new Error(`${target.name} is unavailable in the standard install folder.`)
  await new Promise((accept, reject) => {
    const child = spawn(target.executable, [], { detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', () => reject(new Error(`Could not open ${target.name}.`)))
    child.once('spawn', () => { child.unref(); accept() })
  })
}

export async function openApp({ id, handoffId, programs, root }) {
  const workspace = handoffId === undefined ? null : readWorkspace(root)
  const target = appStatus(id, programs, workspace?.registrations || {})
  if (!target.installed) throw new Error(`${target.name} is unavailable in the standard install folder.`)

  const args = []
  if (handoffId !== undefined) {
    const argument = `--iv-handoff=${handoffId}`
    if (!handoffArgument([argument], id) || !workspace.handoffs.some(item => item.id === handoffId && item.target === id)) {
      throw new Error('This handoff is unavailable. Refresh Hivemind and try again.')
    }
    if (!target.connected) throw new Error(`Open ${target.name} once to connect it before continuing this handoff.`)
    args.push(argument)
  }

  await new Promise((accept, reject) => {
    const child = spawn(target.executable, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', () => reject(new Error(`Could not open ${target.name}.`)))
    child.once('spawn', () => { child.unref(); accept() })
  })
}
