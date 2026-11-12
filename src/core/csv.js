// Minimal RFC 4180 CSV parser/writer (quoted fields, embedded commas/newlines, "" escapes).

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const s = String(text).replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v !== '')) rows.push(row)
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

export function toCsv(records, columns) {
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...records.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\r\n')
}
