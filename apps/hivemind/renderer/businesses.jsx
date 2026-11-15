// The business switcher on the dock and the Businesses tab: which business every IV app works on, the shared
// profiles, and businesses that so far exist in only one app.
import { useCallback, useEffect, useRef, useState } from 'react'

const api = window.hivemind
const appShort = { outreach: 'Outreach', signal: 'Signal' }
const FIELDS = [
  ['website', 'Website', 'input'], ['offer', 'What it offers', 'area'], ['audience', 'Who it serves', 'area'],
  ['voice', 'How it sounds', 'area'], ['visual', 'How it looks', 'area'], ['location', 'Where', 'input'], ['goal', 'Current goal', 'area'],
]
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '·'

export function BusinessMark({ brand, size = 22 }) {
  if (brand?.logoPreview) return <img className="biz-mark" src={brand.logoPreview} alt="" style={{ width: size, height: size }} />
  if (!brand) return <span className="biz-mark all" style={{ width: size, height: size }} aria-hidden="true">∗</span>
  return <span className="biz-mark" style={{ width: size, height: size, background: brand.accent || '#bb2349', fontSize: Math.round(size * 0.42) }} aria-hidden="true">{initials(brand.name)}</span>
}

// The dock's switcher: one click to put every IV app on another business.
export function BusinessSwitcher({ brands, brandId, onPick, onManage }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const current = brands.find(brand => brand.id === brandId) || null
  useEffect(() => {
    if (!open) return
    const away = event => { if (!box.current?.contains(event.target)) setOpen(false) }
    const key = event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key, true) }
  }, [open])
  const pick = id => { setOpen(false); if (id !== brandId) onPick(id) }
  return (
    <div className="switcher" ref={box}>
      <button type="button" className="switch-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Business: ${current?.name || 'All businesses'}`}
        title="Every IV app works on this business" onClick={() => setOpen(value => !value)}>
        <BusinessMark brand={current} size={20} />
        <span>{current?.name || 'All businesses'}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
      </button>
      {open && (
        <div className="switch-menu" role="listbox" aria-label="Choose a business">
          <small>Every IV app works on</small>
          {[null, ...brands].map(brand => (
            <button type="button" role="option" key={brand?.id || 'all'} aria-selected={(brand?.id || '') === brandId} onClick={() => pick(brand?.id || '')}>
              <BusinessMark brand={brand} />
              <span>{brand?.name || 'All businesses'}</span>
              {(brand?.id || '') === brandId && <i aria-hidden="true">✓</i>}
            </button>
          ))}
          <button type="button" className="switch-manage" onClick={() => { setOpen(false); onManage() }}>Manage businesses</button>
        </div>
      )}
    </div>
  )
}

function BusinessForm({ start, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ name: '', website: '', offer: '', audience: '', voice: '', visual: '', location: '', goal: '', accent: '#bb2349', logo: null, logoPreview: null, ...start }))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  async function pickLogo() {
    setProblem('')
    try { const logo = await api.pickLogo(); if (logo) setForm(previous => ({ ...previous, logo: logo.id, logoPreview: logo.preview })) }
    catch (error) { setProblem(error.message) }
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setProblem('')
    try {
      const { logoPreview, apps, revision, updatedAt, updatedBy, ...brand } = form
      onSaved(await api.saveBusiness({ brand, revision: start?.revision }))
    } catch (error) { setProblem(error.message) } finally { setBusy(false) }
  }
  return (
    <form className="biz-form" onSubmit={save}>
      <div className="biz-form-head">
        <button type="button" className="biz-logo" onClick={pickLogo} title="Choose a logo"><BusinessMark brand={{ ...form, name: form.name || '?' }} size={44} /><small>Logo</small></button>
        <label className="biz-name"><span>Name</span><input value={form.name} maxLength="160" required onChange={event => set('name', event.target.value)} /></label>
        <label className="biz-accent" title="Accent colour"><span className="sr-only">Accent colour</span><input type="color" value={form.accent || '#bb2349'} onChange={event => set('accent', event.target.value)} /></label>
      </div>
      {FIELDS.map(([key, label, kind]) => (
        <label key={key} className="biz-field"><span>{label}</span>
          {kind === 'area'
            ? <textarea rows="2" maxLength="2000" value={form[key] || ''} onChange={event => set(key, event.target.value)} />
            : <input maxLength={key === 'website' ? 500 : 2000} value={form[key] || ''} onChange={event => set(key, event.target.value)} />}
        </label>
      ))}
      {problem && <p className="install-error" role="alert">{problem}</p>}
      <div className="install-actions">
        <button className="primary" disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : start?.id ? 'Save' : 'Add business'}</button>
        <button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      <p className="biz-note">IV Outreach and IV Signal update their copy of this business when they're open. Studio and every app's chat use it right away.</p>
    </form>
  )
}

// The Businesses tab.
export function Businesses({ activeId, onPick, onChanged }) {
  const [state, setState] = useState(null)
  const [editing, setEditing] = useState(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(() => api.businesses().then(setState).catch(error => setProblem(error.message)), [])
  useEffect(() => { load() }, [load])

  async function share(item) {
    setBusy(item.localId)
    setProblem('')
    try { await api.shareBusiness({ app: item.app, localId: item.localId }); await load(); onChanged() }
    catch (error) { setProblem(error.message) } finally { setBusy('') }
  }
  if (editing) {
    return (
      <div className="businesses">
        <BusinessForm start={editing === 'new' ? null : editing} onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); onChanged() }} />
      </div>
    )
  }
  return (
    <div className="businesses">
      <div className="biz-top">
        <p>Pick one and every IV app works on it, with its memory.</p>
        <button type="button" className="quiet" onClick={() => setEditing('new')}>New business</button>
      </div>
      {problem && <p className="install-error" role="alert">{problem}</p>}
      {!state && <p className="empty-note">Loading…</p>}
      <ul className="biz-list">
        {state?.shared.map(brand => {
          const on = brand.id === activeId
          return (
            <li key={brand.id} className={on ? 'on' : ''}>
              <BusinessMark brand={brand} size={38} />
              <div className="biz-body">
                <strong>{brand.name}</strong>
                {brand.website && <small>{brand.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</small>}
                <span className="biz-apps">
                  {Object.keys(appShort).map(app => <span key={app} className={brand.apps[app] ? 'yes' : ''} title={brand.apps[app] ? `${appShort[app]} has its copy` : `${appShort[app]} makes its copy the first time you work on this business`}>{appShort[app]}</span>)}
                  <span className="yes" title="Studio and every chat use the shared profile">Studio</span>
                </span>
              </div>
              <div className="biz-actions">
                {on ? <span className="biz-current">Working on this</span> : <button type="button" className="primary" onClick={() => onPick(brand.id)}>Work on this</button>}
                <button type="button" className="quiet" onClick={() => setEditing(brand)}>Edit</button>
              </div>
            </li>
          )
        })}
      </ul>
      {!!state?.unshared.length && (
        <section className="biz-unshared">
          <h3>Only in one app so far</h3>
          <p>Share one to use it across every IV app. Its profile and logo come from that app.</p>
          <ul>
            {state.unshared.map(item => (
              <li key={`${item.app}:${item.localId}`}>
                <span><strong>{item.name}</strong><small>in {item.appName}{item.website ? ` · ${item.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}` : ''}</small></span>
                <button type="button" className="quiet" disabled={Boolean(busy)} onClick={() => share(item)}>{busy === item.localId ? 'Sharing…' : 'Share'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
