// Normalizers used for dedupe and suppression matching.

export function normEmail(value) {
  if (!value) return null
  const v = String(value).trim().toLowerCase().replace(/^mailto:/, '')
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v) ? v : null
}

export function emailDomain(email) {
  const e = normEmail(email)
  return e ? e.split('@')[1] : null
}

export function normUrl(value) {
  if (!value) return null
  let v = String(value).trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

export function domainOf(value) {
  const u = normUrl(value)
  if (!u) return null
  return new URL(u).hostname.toLowerCase().replace(/^www\./, '')
}

// LinkedIn profile/company URLs collapse to https://www.linkedin.com/in/<slug> form.
export function normLinkedin(value) {
  const u = normUrl(value)
  if (!u) return null
  const url = new URL(u)
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2 || !['in', 'company', 'school'].includes(parts[0].toLowerCase())) return null
  return `https://www.linkedin.com/${parts[0].toLowerCase()}/${decodeURIComponent(parts[1]).toLowerCase()}`
}

export function firstName(name) {
  if (!name) return null
  const first = String(name).trim().split(/\s+/)[0]
  return first ? first.replace(/[^\p{L}'-]/gu, '') || null : null
}

export function clip(text, max) {
  if (text == null) return null
  const s = String(text)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
