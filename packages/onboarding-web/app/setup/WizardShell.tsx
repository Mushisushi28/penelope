'use client'

import { WizardProvider, useWizard } from '@/app/wizard/WizardContext'
import { LogoWordmark } from '@/app/components/LogoWordmark'
import { ProgressDots } from '@/app/components/ProgressDots'
import { Step1Basics } from '@/app/wizard/Step1Basics'
import { Step2Vertical } from '@/app/wizard/Step2Vertical'
import { Step3Channels } from '@/app/wizard/Step3Channels'
import { Step4Hours } from '@/app/wizard/Step4Hours'
import { Step5Review } from '@/app/wizard/Step5Review'
import { STEP_LABELS } from '@/app/wizard/data'

function WizardContent() {
  const { state, goTo } = useWizard()

  const stepMap: Record<number, React.ReactElement> = {
    1: <Step1Basics />,
    2: <Step2Vertical />,
    3: <Step3Channels />,
    4: <Step4Hours />,
    5: <Step5Review />,
  }

  return (
    <div className="min-h-screen bg-bone-50 flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-bone-50/90 backdrop-blur-sm border-b border-bone-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <a href="/" className="flex-shrink-0" aria-label="Penelope home">
            <LogoWordmark size="sm" />
          </a>
          <ProgressDots
            total={5}
            current={state.step}
            labels={STEP_LABELS}
            onNavigate={(step) => {
              if (step < state.step) goTo(step)
            }}
          />
        </div>
      </header>

      {/* Step label strip (desktop) */}
      <div className="hidden sm:block bg-bone-100 border-b border-bone-200">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center gap-6">
          {STEP_LABELS.map((label, i) => {
            const step = i + 1
            const isCompleted = step < state.step
            const isActive = step === state.step
            return (
              <button
                key={step}
                type="button"
                onClick={() => isCompleted ? goTo(step) : undefined}
                disabled={!isCompleted}
                className={[
                  'text-xs transition-colors',
                  isActive
                    ? 'text-loom-700 font-medium'
                    : isCompleted
                    ? 'text-loom-500 cursor-pointer hover:text-loom-700'
                    : 'text-charcoal-300 cursor-default',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Wizard body */}
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
          {stepMap[state.step] ?? stepMap[1]}
        </div>
      </main>

      {/* Privacy footer */}
      <footer className="border-t border-bone-200 py-4">
        <p className="text-center text-xs text-charcoal-400">
          Your config never leaves your browser until you deploy.{' '}
          <a
            href="https://github.com/Mushisushi28/penelope"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-charcoal-600"
          >
            Open source
          </a>
          .
        </p>
      </footer>
    </div>
  )
}

export function WizardShell() {
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  )
}
