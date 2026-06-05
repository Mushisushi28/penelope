'use client'

export interface Channel {
  id: string
  name: string
  icon: string
  description: string
  required?: boolean
  inputType: 'token' | 'oauth' | 'webhook'
  placeholder?: string
  helpUrl?: string
}

interface ChannelCardProps {
  channel: Channel
  enabled: boolean
  value: string
  onToggle: (id: string, enabled: boolean) => void
  onChange: (id: string, value: string) => void
}

export function ChannelCard({ channel, enabled, value, onToggle, onChange }: ChannelCardProps) {
  const showInput = enabled && channel.inputType !== 'oauth'
  const showOAuth = enabled && channel.inputType === 'oauth'

  return (
    <div
      className={[
        'card transition-all duration-200',
        enabled
          ? 'border-loom-300 bg-loom-50/60 ring-1 ring-loom-600/10'
          : 'opacity-70',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg bg-bone-200 flex items-center justify-center text-lg flex-shrink-0"
          aria-hidden="true"
        >
          {channel.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-sans font-medium text-sm text-charcoal-700">{channel.name}</span>
            {channel.required && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-loom-100 text-loom-700 font-medium">
                required
              </span>
            )}
          </div>
          <p className="text-xs text-charcoal-500 mt-0.5 truncate">{channel.description}</p>
        </div>

        {/* Toggle (optional channels only) */}
        {!channel.required && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`Enable ${channel.name}`}
            onClick={() => onToggle(channel.id, !enabled)}
            className={[
              'relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loom-600 focus-visible:ring-offset-2',
              enabled ? 'bg-loom-600' : 'bg-bone-300',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                enabled ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        )}
      </div>

      {/* Token input */}
      {showInput && (
        <div className="mt-3">
          <input
            type={channel.inputType === 'token' ? 'text' : 'url'}
            value={value}
            onChange={(e) => onChange(channel.id, e.target.value)}
            placeholder={channel.placeholder ?? `Enter ${channel.name} token`}
            className="input-field font-mono text-xs"
            aria-label={`${channel.name} token`}
          />
          {channel.helpUrl && (
            <a
              href={channel.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-thread-600 hover:text-thread-700 mt-1.5"
            >
              How to get this token
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path
                  d="M2 8 L8 2 M4.5 2 L8 2 L8 5.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* OAuth connect button */}
      {showOAuth && (
        <div className="mt-3">
          <button
            type="button"
            className="btn-secondary text-xs px-4 py-2 gap-1.5"
            onClick={() => {
              // OAuth flow stub — will integrate per-channel in next wave
              window.open(channel.helpUrl ?? '#', '_blank', 'noopener,noreferrer')
            }}
          >
            Connect {channel.name}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 10 L10 2 M5.5 2 L10 2 L10 6.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
