'use client'

export interface Vertical {
  id: string
  name: string
  icon: string
  description: string
  tagline: string
  sampleProcedures: string[]
}

interface VerticalCardProps {
  vertical: Vertical
  selected: boolean
  onSelect: (id: string) => void
}

export function VerticalCard({ vertical, selected, onSelect }: VerticalCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(vertical.id)}
      aria-pressed={selected}
      className={[
        'card text-left transition-all duration-200 w-full',
        selected
          ? 'border-loom-600 bg-loom-50 ring-1 ring-loom-600/20 shadow-sm'
          : 'hover:border-loom-300 hover:shadow-sm',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 transition-colors ${
            selected ? 'bg-loom-600' : 'bg-bone-200'
          }`}
          aria-hidden="true"
        >
          {vertical.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-sans font-medium text-sm text-charcoal-700">{vertical.name}</h3>
            {selected && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="text-loom-600 flex-shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M2 7 L5.5 10.5 L12 3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <p className="text-xs text-charcoal-500 mt-0.5 leading-snug">{vertical.tagline}</p>
        </div>
      </div>

      {/* Sample procedures */}
      <ul className="space-y-1">
        {vertical.sampleProcedures.slice(0, 3).map((proc) => (
          <li key={proc} className="flex items-start gap-2 text-xs text-charcoal-500">
            <span className="text-thread-500 mt-0.5 flex-shrink-0">•</span>
            <span>{proc}</span>
          </li>
        ))}
      </ul>
    </button>
  )
}
