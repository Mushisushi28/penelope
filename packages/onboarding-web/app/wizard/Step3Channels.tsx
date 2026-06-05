'use client'

import { useWizard } from './WizardContext'
import { ChannelCard } from '@/app/components/ChannelCard'
import { StepNav } from '@/app/components/StepNav'
import { CHANNELS } from './data'

export function Step3Channels() {
  const { state, setChannelEnabled, setChannelValue, next, back } = useWizard()

  const telegramToken = state.channels['telegram']?.token ?? ''
  const canContinue = telegramToken.trim().length > 0

  const requiredChannels = CHANNELS.filter((c) => c.required)
  const optionalChannels = CHANNELS.filter((c) => !c.required)

  return (
    <div className="animate-slide-up">
      <h2 className="display-serif text-3xl text-loom-700 mb-1">Connect your channels</h2>
      <p className="text-sm text-charcoal-500 mb-6">
        Penelope routes messages and notifications through these integrations.
        You can add more after setup.
      </p>

      {/* Required */}
      <div className="mb-6">
        <p className="label-caps mb-3">Owner notifications (required)</p>
        {requiredChannels.map((ch) => (
          <ChannelCard
            key={ch.id}
            channel={ch}
            enabled={state.channels[ch.id]?.enabled ?? true}
            value={state.channels[ch.id]?.token ?? ''}
            onToggle={setChannelEnabled}
            onChange={setChannelValue}
          />
        ))}
        {!canContinue && (
          <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg bg-thread-50 border border-thread-200 text-xs text-thread-700">
            <span>⚠️</span>
            <span>
              A Telegram bot token is required.{' '}
              <a
                href="https://core.telegram.org/bots/tutorial#getting-ready"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-thread-900"
              >
                Create a bot with @BotFather
              </a>{' '}
              and paste the token above.
            </span>
          </div>
        )}
      </div>

      {/* Optional */}
      <div>
        <p className="label-caps mb-3">Customer channels (optional)</p>
        <div className="space-y-3">
          {optionalChannels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              enabled={state.channels[ch.id]?.enabled ?? false}
              value={state.channels[ch.id]?.token ?? ''}
              onToggle={setChannelEnabled}
              onChange={setChannelValue}
            />
          ))}
        </div>
      </div>

      <StepNav
        currentStep={3}
        totalSteps={5}
        onBack={back}
        onNext={next}
        nextDisabled={!canContinue}
      />
    </div>
  )
}
