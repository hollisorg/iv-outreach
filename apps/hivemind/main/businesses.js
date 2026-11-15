// IV Hivemind's businesses: the shared profiles every IV app works from, which one is active, and the businesses that
// exist in only one app so far. Writes go through the shared workspace contract (iv-workspace.js), the same code the
// apps use, so the apps pick up changes on their own: Outreach and Signal re-import an edited profile into their linked
// copy and switch to the active business; Studio and every app's chat read it.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { IVWorkspace, cleanBrand, fingerprint, workspaceDir } from '../../../src/service/iv-workspace.js'

const appData = () => process.env.APPDATA || join(homedir(), '.config')
// Where Outreach and Signal keep their own businesses (each app's own data folder and table).
export const NATIVE = {
  outreach: { name: 'IV Outreach', dir: () => process.env.FITSCOUT_DATA_DIR || join(appData(), 'Fitscout'), file: 'fitscout.db', table: 'businesses' },
  signal: { name: 'IV Signal', dir: () => process.env.IV_SIGNAL_DATA_DIR || join(appData(), 'IV Signal'), file: 'signal.db', table: 'brands' },
}

function nativeBusinesses(app) {
  const { dir, file, table } = NATIVE[app]
  const path = join(dir(), file)
  if (!existsSync(path)) return []
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout=1500')
    return db.prepare(`SELECT id, name, profile_json FROM ${table} ORDER BY created_at, id`).all()
      .map(row => { let profile = {}; try { profile = JSON.parse(row.profile_json || '{}') } catch {} return { id: row.id, name: row.name, profile } })
  } catch {
    return []
  } finally {
    db.close()
  }
}

export function businesses({ root = process.env.IV_WORKSPACE_DIR || workspaceDir() } = {}) {
  const open = appId => new IVWorkspace({ root, appId, profile: appId === 'hivemind' ? '' : NATIVE[appId].dir() })
  const withStore = (appId, fn) => { const w = open(appId); try { return fn(w) } finally { w.close() } }

  function list() {
    return withStore('hivemind', hive => {
      const linked = {}
      const unshared = []
      for (const app of Object.keys(NATIVE)) {
        const links = withStore(app, w => w.links())
        const native = nativeBusinesses(app)
        for (const item of native) {
          const link = links.find(entry => entry.localId === item.id)
          if (link) (linked[link.brandId] ||= {})[app] = { localId: item.id, name: item.name }
          else unshared.push({ app, appName: NATIVE[app].name, localId: item.id, name: item.name, website: item.profile?.website || '' })
        }
      }
      const shared = hive.brands().map(brand => {
        let logo = null
        try { logo = brand.logo ? hive.preview(brand.logo) : null } catch {}
        return { ...brand, logoPreview: logo, apps: linked[brand.id] || {} }
      })
      return { active: hive.active(), shared, unshared }
    })
  }

  // Add or edit a shared profile. revision guards against a change made in an app meanwhile.
  function save({ brand, revision }) {
    return withStore('hivemind', w => w.saveBrand(brand || {}, revision))
  }

  // A business that exists in one app only becomes a shared profile, linked back to that app's copy (the same steps
  // the app's own "Share current business" takes).
  function share({ app, localId }) {
    if (!Object.hasOwn(NATIVE, app)) throw new Error('Choose IV Outreach or IV Signal.')
    const item = nativeBusinesses(app).find(entry => entry.id === localId)
    if (!item) throw new Error(`That business isn't in ${NATIVE[app].name} anymore.`)
    return withStore(app, w => {
      const existing = w.link(localId)
      if (existing) return w.brand(existing.brandId)
      const profile = cleanBrand({ ...item.profile, name: item.name, logo: null })
      const print = fingerprint({ ...profile, logo_id: item.profile?.logo_id || '' })
      let logo = null
      const logoFile = /^[a-f0-9]{64}\.(png|jpg)$/.test(item.profile?.logo_id || '') ? join(NATIVE[app].dir(), 'brand-assets', item.profile.logo_id) : ''
      if (logoFile && existsSync(logoFile)) { try { logo = w.addAsset(logoFile).id } catch {} }
      const brand = w.saveBrand({ ...profile, logo })
      w.setLink(localId, { brandId: brand.id, revision: brand.revision, fingerprint: print })
      return brand
    })
  }

  function setActive(brandId) {
    return withStore('hivemind', w => w.setActive(brandId || ''))
  }
  function active() {
    return withStore('hivemind', w => w.active())
  }
  function addLogo(file) {
    return withStore('hivemind', w => {
      const asset = w.addAsset(file)
      if (asset.kind !== 'image' || asset.bytes > 4 * 1024 * 1024 || !/\.(png|jpg|webp)$/.test(asset.file)) throw new Error('Choose a PNG, JPG or WebP logo smaller than 4 MB.')
      return { id: asset.id, preview: w.preview(asset.id) }
    })
  }

  return { list, save, share, setActive, active, addLogo }
}
