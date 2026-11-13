import test from 'node:test'
import assert from 'node:assert/strict'
import { createLeadPreview, previewCandidates, webDestination } from '../src/service/lead-preview.js'
import { safeFetch } from '../src/core/enrich.js'

test('lead links normalize web addresses and reject executable or credential-bearing destinations', () => {
  assert.equal(webDestination('example.com/about'), 'https://example.com/about')
  assert.equal(webDestination('https://example.com/?a=1&b=2'), 'https://example.com/?a=1&b=2')
  for (const url of ['javascript:alert(1)', 'file:///C:/private', 'data:text/html,hello', 'https://user:secret@example.com', 'https://example.com/\nfile', '']) assert.throws(()=>webDestination(url))
})
test('website preview extracts declared imagery, resolves relative URLs and ignores scripts', () => {
  const result = previewCandidates(`<script>"<meta property='og:image' content='/fake.jpg'>"</script><meta content='/cover.jpg?a=1&amp;b=2' property='og:image'><link href='/logo.png' rel='apple-touch-icon'><meta name='twitter:image' content='javascript:alert(1)'>`, 'https://example.com/')
  assert.deepEqual(result, {images:['https://example.com/cover.jpg?a=1&b=2'], logos:['https://example.com/logo.png']})
})
test('preview falls back to own-site hero photos and skips trackers, logos and small images', () => {
  const r = previewCandidates(`<img width='1' height='1' src='https://tracker.test/pixel'><img width='900' height='300' src='/logo.jpg'><img width='400' height='300' src='/product.jpg'><img width='1920' height='800' src='data:image/svg+xml,placeholder' data-src='/hero.jpg'><img width='800' height='500' src='https://tracker.test/photo.jpg'>`, 'https://example.com/')
  assert.deepEqual(r.images, ['https://example.com/hero.jpg','https://example.com/product.jpg'])
})
test('previews respect robots, cache results, and return only decoded image data', async () => {
  const requests = []
  const fetcher = async (url, options = {}) => {
    requests.push(url)
    if (options.beforeFetch) await options.beforeFetch(new URL(url))
    if (url.endsWith('/robots.txt')) return {status:200,text:'User-agent: *\nDisallow: /blocked.jpg'}
    if (url.endsWith('/')) return {status:200,url,text:`<meta property='og:image' content='/blocked.jpg'><meta name='twitter:image' content='/cover.jpg'>`}
    return {status:200,url,buffer:Buffer.from('fake raster'),type:'image/jpeg'}
  }
  const native = {createFromBuffer:()=>({getSize:()=>({width:20,height:20}),isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,decoded'})}
  const preview = createLeadPreview(native, fetcher)
  const result = await preview('https://example.com/')
  assert.equal(result.image, 'data:image/png;base64,decoded')
  assert.equal(result.logo, null)
  const count = requests.length
  assert.deepEqual(await preview('https://example.com/'), result)
  assert.equal(requests.length, count)
  assert.equal(requests.filter(u=>u.endsWith('robots.txt')).length, 1)
})
test('missing or broken website previews return a graceful empty state', async () => {
  const preview = createLeadPreview({}, async()=>{throw new Error('offline')})
  assert.deepEqual(await preview(null), {image:null,logo:null})
  assert.deepEqual(await preview('https://example.com'), {image:null,logo:null,source:'https://example.com/'})
})
test('preview fetching rejects local network destinations before making a request', async () => {
  await assert.rejects(safeFetch('http://127.0.0.1/image.png', {binary:true}), /non-public/)
  await assert.rejects(safeFetch('http://localhost/image.png', {binary:true}), /non-public/)
})
