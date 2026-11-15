// The agent's light Markdown as formatting (paragraphs, bullet and numbered lists, quotes, headings, bold, italics,
// code), built from React elements only: no HTML from the agent is ever inserted.
import React from 'react'

function inline(text, keyBase) {
  const out = []
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g
  let last = 0
  let index = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyBase}-${index++}`
    if (token.startsWith('**') || token.startsWith('__')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else out.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function RichText({ text, caret = null }) {
  const blocks = []
  let list = null
  let quote = null
  let paragraph = []
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ type: 'p', lines: paragraph }); paragraph = [] } }
  const flushList = () => { if (list) { blocks.push(list); list = null } }
  const flushQuote = () => { if (quote) { blocks.push(quote); quote = null } }
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
    const quoted = /^\s*>\s?(.*)$/.exec(line)
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph(); flushQuote()
      const kind = bullet ? 'ul' : 'ol'
      if (!list || list.type !== kind) { flushList(); list = { type: kind, items: [] } }
      list.items.push(bullet ? bullet[1] : numbered[2])
    } else if (quoted) {
      flushParagraph(); flushList()
      quote ||= { type: 'quote', lines: [] }
      quote.lines.push(quoted[1])
    } else if (heading) {
      flushParagraph(); flushList(); flushQuote()
      blocks.push({ type: 'h', text: heading[1] })
    } else if (!line.trim()) {
      flushParagraph(); flushList(); flushQuote()
    } else {
      flushList(); flushQuote()
      paragraph.push(line)
    }
  }
  flushParagraph(); flushList(); flushQuote()
  return (
    <div className="rich">
      {blocks.map((block, at) => {
        const end = at === blocks.length - 1 ? caret : null
        if (block.type === 'ul' || block.type === 'ol') {
          const Tag = block.type
          return <Tag key={at}>{block.items.map((item, i) => <li key={i}>{inline(item, `${at}-${i}`)}{i === block.items.length - 1 && end}</li>)}</Tag>
        }
        if (block.type === 'quote') return <blockquote key={at}>{block.lines.map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(line, `${at}-${i}`)}</React.Fragment>)}{end}</blockquote>
        if (block.type === 'h') return <p key={at} className="rich-heading">{inline(block.text, `${at}`)}{end}</p>
        return <p key={at}>{block.lines.map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(line, `${at}-${i}`)}</React.Fragment>)}{end}</p>
      })}
    </div>
  )
}
