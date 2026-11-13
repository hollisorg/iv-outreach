import { safeFetch, robotsAllows } from '../core/enrich.js'

export function webDestination(value) {
  const text = String(value || '').trim()
  if (!text || text.length > 4096 || /[\u0000-\u0020]/.test(text)) throw new Error('This link is not a valid website address.')
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('Only public website links can be opened.')
  return url.href
}

const decode = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const v = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : '' })
export function previewCandidates(html, base) {
  const images = [], logos = [], photos = []
  for (const tag of html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>/gi, '').matchAll(/<(meta|link|img)\b[^>]*>/gi)) {
    const attrs = {}
    for (const a of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4])
    let target, raw
    if (/^(og:image(?::url)?|twitter:image(?::src)?)$/i.test(attrs.property || attrs.name || '')) { target = images; raw = attrs.content }
    if (tag[1].toLowerCase() === 'link' && /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(attrs.rel || '')) { target = logos; raw = attrs.href }
    if (tag[1].toLowerCase() === 'img') {
      raw = attrs['data-src'] || attrs.src
      const description = `${raw || ''} ${attrs.class || ''} ${attrs.alt || ''}`
      const large = Number(attrs.width) >= 300 && Number(attrs.height) >= 160
      const hero = /hero|banner|cover|team|storefront/i.test(description)
      if ((large || hero) && !/logo|badge|seal|icon|pixel|tracking|\.gif(?:\?|$)/i.test(description)) {
        try { if (new URL(raw, base).origin === new URL(base).origin) photos.push({url:webDestination(new URL(raw,base).href),hero}) } catch {}
      }
      continue
    }
    if (!raw || !target) continue
    try { const url = webDestination(new URL(raw, base).href); if (!target.includes(url)) target.push(url) } catch {}
  }
  return { images: [...new Set([...images, ...photos.sort((a,b)=>Number(b.hero)-Number(a.hero)).map(p=>p.url)])].slice(0, 2), logos: logos.slice(0, 2) }
}

// Fetch only imagery published by the business, then decode to a bounded PNG.
// Renderer receives data URLs, never remote HTML or unrestricted image access.
export function createLeadPreview(nativeImage, fetcher = safeFetch) {
  const cache = new Map()
  async function load(website) {
    const robots = new Map()
    const beforeFetch = async url => {
      if (!robots.has(url.origin)) {
        const r = await fetcher(`${url.origin}/robots.txt`, { accept: 'text/plain' })
        if (r.status !== 200 && r.status !== 404) throw new Error('Website preview unavailable')
        robots.set(url.origin, r.text || '')
      }
      if (!robotsAllows(robots.get(url.origin), url.pathname)) throw new Error('Website does not permit this preview')
    }
    const page = await fetcher(website, { beforeFetch })
    if (page.status !== 200 || !page.text) return { image: null, logo: null, source: website }
    const candidates = previewCandidates(page.text, page.url)
    async function picture(urls, width) {
      for (const url of urls) {
        try {
          const r = await fetcher(url, { binary: true, maxBytes: 4_000_000, accept: 'image/png,image/jpeg,image/webp,image/x-icon', beforeFetch })
          if (r.status !== 200 || !/^image\/(png|jpe?g|webp|x-icon|vnd.microsoft.icon)(;|$)/i.test(r.type)) continue
          // Chromium supports WebP even on platforms where nativeImage does not.
          if (/^image\/webp(;|$)/i.test(r.type) && r.buffer?.subarray(0,4).toString() === 'RIFF' && r.buffer.subarray(8,12).toString() === 'WEBP') return `data:image/webp;base64,${r.buffer.toString('base64')}`
          const img = nativeImage.createFromBuffer(r.buffer), size = img.getSize()
          if (img.isEmpty() || size.width * size.height > 25_000_000) continue
          return (size.width > width ? img.resize({ width }) : img).toDataURL()
        } catch { /* Try the next public image; absence is an ordinary state. */ }
      }
      return null
    }
    const [image, logo] = await Promise.all([picture(candidates.images, 1000), picture(candidates.logos, 128)])
    return { image, logo, source: page.url }
  }
  return async website => {
    if (!website) return { image: null, logo: null }
    const url = webDestination(website)
    const old = cache.get(url)
    if (old && Date.now() - old.at < 6 * 60 * 60 * 1000) return old.promise
    const promise = load(url).catch(() => ({ image: null, logo: null, source: url }))
    if (cache.size >= 40) cache.delete(cache.keys().next().value)
    cache.set(url, { at: Date.now(), promise })
    return promise
  }
}
