import eyeMark from '../assets/iv-mark.png'

// The Infinite Variance eye, shared with IV Studio.
export function Mark({ size = 28 }) {
  return <img src={eyeMark} width={size} height={Math.round(size * 0.64)} alt="" className="iv-mark" />
}

export function Wordmark({ tone = 'light' }) {
  return (
    <span className={`logo logo-${tone}`} aria-label="IV Outreach">
      <Mark size={32} />
      <span className="wordmark">Infinite Variance <span>/ Outreach</span></span>
    </span>
  )
}
