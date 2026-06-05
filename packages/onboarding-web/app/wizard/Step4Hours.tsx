'use client'

import { useWizard } from './WizardContext'
import { StepNav } from '@/app/components/StepNav'
import { HOURS_OPTIONS, RESPONSE_STYLES } from './data'

export function Step4Hours() {
  const { state, setHours, setPreferences, next, back } = useWizard()
  const { hours, preferences } = state

  return (
    <div className="animate-slide-up">
      <h2 className="display-serif text-3xl text-loom-700 mb-1">Hours & preferences</h2>
      <p className="text-sm text-charcoal-500 mb-8">
        Set when Penelope responds and how she sounds to your customers.
      </p>

      {/* Hours preset */}
      <div className="mb-8">
        <p className="label-caps mb-3">Response hours</p>
        <div className="space-y-2">
          {HOURS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={[
                'flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border transition-all duration-150',
                hours.preset === opt.value
                  ? 'border-loom-600 bg-loom-50 ring-1 ring-loom-600/20'
                  : 'border-bone-200 hover:border-loom-200 hover:bg-bone-50',
              ].join(' ')}
            >
              <input
                type="radio"
                name="hoursPreset"
                value={opt.value}
                checked={hours.preset === opt.value}
                onChange={() => setHours({ preset: opt.value })}
                className="mt-0.5 accent-loom-600"
                aria-label={opt.label}
              />
              <div>
                <span className="text-sm font-medium text-charcoal-700">{opt.label}</span>
                <p className="text-xs text-charcoal-500 mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Timezone */}
      <div className="mb-8">
        <label htmlFor="timezone" className="input-label">Timezone</label>
        <input
          id="timezone"
          type="text"
          value={hours.timezone}
          onChange={(e) => setHours({ timezone: e.target.value })}
          className="input-field"
          placeholder="America/New_York"
        />
        <p className="text-xs text-charcoal-400 mt-1">
          IANA timezone name — e.g. America/Chicago, Europe/London.
        </p>
      </div>

      {/* Response style */}
      <div className="mb-8">
        <p className="label-caps mb-3">Response style</p>
        <div className="space-y-2">
          {RESPONSE_STYLES.map((style) => (
            <label
              key={style.value}
              className={[
                'flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border transition-all duration-150',
                preferences.responseStyle === style.value
                  ? 'border-loom-600 bg-loom-50 ring-1 ring-loom-600/20'
                  : 'border-bone-200 hover:border-loom-200 hover:bg-bone-50',
              ].join(' ')}
            >
              <input
                type="radio"
                name="responseStyle"
                value={style.value}
                checked={preferences.responseStyle === style.value}
                onChange={() => setPreferences({ responseStyle: style.value })}
                className="mt-0.5 accent-loom-600"
                aria-label={style.label}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-charcoal-700">{style.label}</span>
                  <span className="text-xs text-charcoal-400">{style.description}</span>
                </div>
                <p className="text-xs text-charcoal-500 italic truncate">&ldquo;{style.example}&rdquo;</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Automation toggles */}
      <div>
        <p className="label-caps mb-3">Automation</p>
        <div className="space-y-3">
          {([
            {
              key: 'autoQuote',
              label: 'Auto-quote',
              description: 'Send pricing estimates automatically when a customer asks.',
            },
            {
              key: 'autoBooking',
              label: 'Auto-booking',
              description: 'Let customers book appointments without owner approval.',
            },
            {
              key: 'reviewAsk',
              label: 'Review request',
              description: 'Ask for a Google review 2 days after a completed job.',
            },
          ] as const).map((toggle) => (
            <div
              key={toggle.key}
              className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-bone-200 bg-bone-50"
            >
              <div>
                <p className="text-sm font-medium text-charcoal-700">{toggle.label}</p>
                <p className="text-xs text-charcoal-500 mt-0.5">{toggle.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences[toggle.key]}
                aria-label={toggle.label}
                onClick={() =>
                  setPreferences({ [toggle.key]: !preferences[toggle.key] })
                }
                className={[
                  'relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loom-600 focus-visible:ring-offset-2',
                  preferences[toggle.key] ? 'bg-loom-600' : 'bg-bone-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                    preferences[toggle.key] ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <StepNav
        currentStep={4}
        totalSteps={5}
        onBack={back}
        onNext={next}
      />
    </div>
  )
}
