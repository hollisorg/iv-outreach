// The Fitscout mark: a scout's pin with a target (fit) at its head, and the dashed trail that led there.
// Drawn in code so it stays sharp at every size. tone: 'light' on dark backgrounds, 'dark' on paper.
export function Mark({ size = 28, tone = 'light' }) {
  const fg = tone === 'light' ? '#f3eee3' : '#183126'
  const bg = tone === 'light' ? '#183126' : '#f3eee3'
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path d="M96 420c24-28 52-44 84-50m42-6c28-2 50-8 68-22" fill="none" stroke={fg} strokeWidth="22" strokeLinecap="round" strokeDasharray="1 44" opacity=".6" />
      <path d="M300 64c-70 0-126 56-126 126 0 88 126 210 126 210s126-122 126-210c0-70-56-126-126-126z" fill={fg} />
      <circle cx="300" cy="190" r="74" fill={bg} />
      <circle cx="300" cy="190" r="50" fill={fg} />
      <circle cx="300" cy="190" r="28" fill="#d4551f" />
    </svg>
  )
}

export function Wordmark({ tone = 'light' }) {
  return (
    <span className={`logo logo-${tone}`}>
      <Mark size={26} tone={tone} />
      <span className="wordmark">Fitscout</span>
    </span>
  )
}
