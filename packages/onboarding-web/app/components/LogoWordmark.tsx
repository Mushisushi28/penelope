'use client'

interface LogoWordmarkProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'inverse'
  showTagline?: boolean
  className?: string
}

const sizes = {
  sm: { mark: 28, text: 18, tagline: 10 },
  md: { mark: 36, text: 24, tagline: 12 },
  lg: { mark: 48, text: 32, tagline: 14 },
}

export function LogoWordmark({
  size = 'md',
  variant = 'default',
  showTagline = false,
  className = '',
}: LogoWordmarkProps) {
  const s = sizes[size]
  const markColor = variant === 'inverse' ? '#FDFCFA' : '#2D4A3E'
  const threadColor = variant === 'inverse' ? '#C9983F' : '#C9983F'
  const textColor = variant === 'inverse' ? '#FDFCFA' : '#2D4A3E'
  const taglineColor = variant === 'inverse' ? 'rgba(253,252,250,0.6)' : '#6b7280'

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Mark: chat bubble with loom threads */}
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Bubble body */}
        <rect x="2" y="2" width="30" height="26" rx="5" fill={markColor} />
        {/* Tail */}
        <path d="M8 28 L4 36 L14 30" fill={markColor} />
        {/* Warp threads (vertical) */}
        <line x1="10" y1="8"  x2="10" y2="22" stroke={threadColor} strokeWidth="1.4" strokeLinecap="round" />
        <line x1="17" y1="8"  x2="17" y2="22" stroke={threadColor} strokeWidth="1.4" strokeLinecap="round" />
        <line x1="24" y1="8"  x2="24" y2="22" stroke={threadColor} strokeWidth="1.4" strokeLinecap="round" />
        {/* Weft pass (horizontal shuttle) */}
        <path
          d="M8 15 Q12 13 17 15 Q22 17 26 15"
          stroke={variant === 'inverse' ? 'rgba(253,252,250,0.4)' : 'rgba(255,255,255,0.7)'}
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        {/* Shuttle dot */}
        <circle cx="28" cy="15" r="2" fill={variant === 'inverse' ? '#A0522D' : '#A0522D'} />
      </svg>

      {/* Wordmark + tagline */}
      <div className="flex flex-col leading-none">
        <span
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 300,
            fontSize: s.text,
            color: textColor,
            letterSpacing: '0.01em',
          }}
        >
          penelope
        </span>
        {showTagline && (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontWeight: 400,
              fontSize: s.tagline,
              color: taglineColor,
              marginTop: 2,
              letterSpacing: '0.02em',
            }}
          >
            She runs the home while Odysseus is away.
          </span>
        )}
      </div>
    </div>
  )
}
