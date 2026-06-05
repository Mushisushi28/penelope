'use client'

import { useWizard } from './WizardContext'
import { VerticalCard } from '@/app/components/VerticalCard'
import { StepNav } from '@/app/components/StepNav'
import { VERTICALS } from './data'

export function Step2Vertical() {
  const { state, setVertical, next, back } = useWizard()

  const selected = VERTICALS.find((v) => v.id === state.vertical)

  return (
    <div className="animate-slide-up">
      <h2 className="display-serif text-3xl text-loom-700 mb-1">What kind of business are you?</h2>
      <p className="text-sm text-charcoal-500 mb-6">
        Penelope loads procedures tuned for your industry. You can customize them later.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {VERTICALS.map((v) => (
          <VerticalCard
            key={v.id}
            vertical={v}
            selected={state.vertical === v.id}
            onSelect={setVertical}
          />
        ))}
      </div>

      {selected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-loom-50 border border-loom-200 text-sm text-loom-700 mb-2">
          <span>{selected.icon}</span>
          <span>
            <span className="font-medium">{selected.name}</span> selected — procedures loaded.
          </span>
        </div>
      )}

      <StepNav
        currentStep={2}
        totalSteps={5}
        onBack={back}
        onNext={next}
        nextDisabled={!state.vertical}
      />
    </div>
  )
}
