'use client'

interface StepNavProps {
  currentStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  isLastStep?: boolean
  isLoading?: boolean
}

export function StepNav({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  nextLabel,
  nextDisabled = false,
  isLastStep = false,
  isLoading = false,
}: StepNavProps) {
  const label = nextLabel ?? (isLastStep ? 'Deploy' : 'Continue')

  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-bone-200">
      {/* Back */}
      {currentStep > 1 ? (
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="btn-secondary text-sm px-4 py-2"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3 L5 8 L10 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-3">
        <span className="label-caps text-charcoal-400">
          {currentStep} / {totalSteps}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || isLoading}
          className={isLastStep ? 'btn-primary' : 'btn-thread'}
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Working...
            </>
          ) : (
            <>
              {label}
              {!isLastStep && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M6 3 L11 8 L6 13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
