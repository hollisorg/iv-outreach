// Adapter for OpenOutreach's public CSV contract. No upstream code or runtime is bundled.
import { readFileSync, statSync } from 'node:fs'
import { parseCsv } from './csv.js'

export const OPENOUTREACH_COLUMNS = ['email', 'first_name', 'last_name', 'company', 'title', 'website', 'linkedin_url', 'reason', 'lead_id', 'qualified_at']
const MAX_BYTES = 10 * 1024 * 1024

export function readLeadCsv(path) {
  if (statSync(path).size > MAX_BYTES) throw new Error('Choose a CSV smaller than 10 MB.')
  const bytes = readFileSync(path)
  // Windows PowerShell's > writes UTF-16LE; newer shells generally write UTF-8.
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8')
  return text.replace(/^\uFEFF/, '')
}

export function isOpenOutreachCsv(text) {
  const header = text.split(/\r?\n/, 1)[0].split(',').map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase())
  return OPENOUTREACH_COLUMNS.every((name) => header.includes(name))
}

export function parseOpenOutreachCsv(text) {
  if (!isOpenOutreachCsv(text)) throw new Error('This is not an OpenOutreach export. Export its standard CSV with all ten columns, including lead_id and reason.')
  // Unlike the generic legacy parser, reject a truncated quoted field before writing anything.
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue
    if (quoted && text[i + 1] === '"') i++
    else quoted = !quoted
  }
  if (quoted) throw new Error('The CSV ends inside a quoted field. Export it again before importing.')
  const rows = parseCsv(text)
  if (rows.length > 10000) throw new Error('Import at most 10,000 leads at a time.')
  return rows.map((row, i) => {
    if (!row.lead_id || row.lead_id.length > 200) throw new Error(`Row ${i + 2} needs a valid OpenOutreach lead_id.`)
    return {
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.full_name || null,
      company: row.company, title: row.title, website: row.website, email: row.email,
      linkedin_url: row.linkedin_url, source: 'openoutreach', source_url: row.linkedin_url || row.website,
      _openoutreach: { external_id: row.lead_id, reason: row.reason, qualified_at: row.qualified_at },
    }
  })
}

export function previewOpenOutreachCsv(path) {
  const rows = parseOpenOutreachCsv(readLeadCsv(path))
  return {
    rows: rows.length,
    with_email: rows.filter((r) => r.email).length,
    sample: rows.slice(0, 5).map((r) => ({ name: r.name, company: r.company, title: r.title, reason: r._openoutreach.reason })),
  }
}
