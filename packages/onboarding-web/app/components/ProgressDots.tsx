'use client'

interface ProgressDotsProps {
  total: number
  current: number // 1-indexed
  labels?: string[]
  onNavigate?: (step: number) => void
}

export function ProgressDots({ total, current, labels, onNavigate }: ProgressDotsProps) {
  return (
    <div className="flex items-center gap-0" role="list" aria-label="Wizard steps">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const isCompleted = step < current
        const isActive = step === current
        const canNavigate = isCompleted && !!onNavigate

        return (
          <div key={step} className="flex items-center" role="listitem">
            {/* Connector line before dot (skip first) */}
            {i > 0 && (
              <div
                className={`h-px w-6 transition-colors duration-300 ${
                  step <= current ? 'bg-loom-600' : 'bg-bone-300'
                }`}
              />
            )}

            {/* Dot */}
            <button
              type="button"
              onClick={canNavigate ? () => onNavigate(step) : undefined}
              disabled={!canNavigate && !isActive}
              aria-label={labels ? `Step ${step}: ${labels[i]}` : `Step ${step}`}
              aria-current={isActive ? 'step' : undefined}
              className={[
                'relative flex items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loom-600 focus-visible:ring-offset-2',
                isActive
                  ? 'w-8 h-8 bg-loom-600 text-bone-50 shadow-md'
                  : isCompleted
                  ? 'w-7 h-7 bg-loom-100 text-loom-700 cursor-pointer hover:bg-loom-200'
                  : 'w-7 h-7 bg-bone-200 text-charcoal-400 cursor-default',
              ].join(' ')}
            >
              {isCompleted ? (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path
                    d="M2 7 L5 10 L11 3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="text-xs font-medium font-sans">{step}</span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
