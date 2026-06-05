'use client'

import { useState } from 'react'
import { useWizard } from './WizardContext'
import { StepNav } from '@/app/components/StepNav'
import { CHANNELS, VERTICALS, HOURS_OPTIONS, RESPONSE_STYLES } from './data'
import type { TenantConfig } from './types'

function buildTenantConfig(state: ReturnType<typeof useWizard>['state']): TenantConfig {
  return {
    id: `${state.business.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString(36)}`,
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    business: {
      ...state.business,
      vertical: state.vertical,
    },
    channels: state.channels,
    hours: state.hours,
    preferences: state.preferences,
  }
}

async function downloadTenantZip(config: TenantConfig) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  zip.file('tenant.json', JSON.stringify(config, null, 2))

  const enabledChannels = Object.entries(config.channels)
    .filter(([, c]) => c.enabled && c.token)
    .map(([id, c]) => `${id.toUpperCase().replace(/-/g, '_')}_TOKEN=${c.token}`)
    .join('\n')

  zip.file(
    '.env',
    `# Penelope tenant environment — generated ${config.generatedAt}\n# Keep this file private.\n\n${enabledChannels}\n`
  )

  zip.file(
    'README.md',
    `# ${config.business.name} — Penelope config\n\nGenerated: ${config.generatedAt}\n\n` +
      `1. Place this folder alongside your Penelope install\n` +
      `2. Run: \`penelope up\`\n\n` +
      `Tenant ID: \`${config.id}\`\n`
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `penelope-tenant-${config.id}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

function ReviewRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-bone-200 last:border-0">
      <span className="label-caps w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-charcoal-700 flex-1">{value}</span>
    </div>
  )
}

export function Step5Review() {
  const { state, back } = useWizard()
  const [isLoading, setIsLoading] = useState(false)
  const [deployMode, setDeployMode] = useState<'zip' | 'api'>('zip')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = buildTenantConfig(state)
  const vertical = VERTICALS.find((v) => v.id === state.vertical)
  const hoursLabel = HOURS_OPTIONS.find((o) => o.value === state.hours.preset)?.label ?? state.hours.preset
  const styleLabel = RESPONSE_STYLES.find((s) => s.value === state.preferences.responseStyle)?.label ?? state.preferences.responseStyle

  const enabledChannels = Object.entries(state.channels)
    .filter(([, c]) => c.enabled)
    .map(([id]) => CHANNELS.find((ch) => ch.id === id)?.name ?? id)

  async function handleDeploy() {
    setIsLoading(true)
    setError(null)
    try {
      if (deployMode === 'zip') {
        await downloadTenantZip(config)
        setSuccess(true)
      } else {
        const res = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant: config }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        setSuccess(true)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-loom-100 flex items-center justify-center text-loom-600">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 10 L8 14 L16 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h2 className="display-serif text-2xl text-loom-700 leading-tight">
              {deployMode === 'zip' ? 'Download ready.' : 'Config pushed.'}
            </h2>
            <p className="text-sm text-charcoal-500">
              {deployMode === 'zip'
                ? 'Unzip alongside your Penelope install and run penelope up.'
                : 'Your Penelope instance is being configured.'}
            </p>
          </div>
        </div>

        <div className="terminal mb-6">
          <span className="text-loom-300">$</span> penelope up{'\n'}
          <span className="text-thread-400">→</span> loading tenant{' '}
          <span className="text-bone-200">{config.id}</span>{'\n'}
          <span className="text-thread-400">→</span> vertical:{' '}
          <span className="text-bone-200">{state.vertical}</span>{'\n'}
          <span className="text-thread-400">→</span> channels:{' '}
          <span className="text-bone-200">{enabledChannels.join(', ')}</span>{'\n'}
          <span className="text-loom-300">✓</span>{' '}
          <span className="text-bone-50">Penelope is ready.</span>
        </div>

        <a
          href="https://github.com/Mushisushi28/penelope"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm inline-flex"
        >
          View Penelope on GitHub
        </a>
      </div>
    )
  }

  return (
    <div className="animate-slide-up">
      <h2 className="display-serif text-3xl text-loom-700 mb-1">Review & deploy</h2>
      <p className="text-sm text-charcoal-500 mb-8">
        Your config never leaves your browser until you hit Deploy.
      </p>

      {/* Summary */}
      <div className="card mb-6">
        <ReviewRow label="Business" value={state.business.name} />
        <ReviewRow label="Owner" value={state.business.ownerName} />
        <ReviewRow label="Location" value={state.business.location} />
        <ReviewRow label="Vertical" value={`${vertical?.icon ?? ''} ${vertical?.name ?? state.vertical}`} />
        <ReviewRow label="Hours" value={hoursLabel} />
        <ReviewRow label="Timezone" value={state.hours.timezone} />
        <ReviewRow label="Style" value={styleLabel} />
        <ReviewRow
          label="Channels"
          value={enabledChannels.join(', ') || '—'}
        />
        <ReviewRow
          label="Automation"
          value={[
            state.preferences.autoQuote && 'Auto-quote',
            state.preferences.autoBooking && 'Auto-booking',
            state.preferences.reviewAsk && 'Review ask',
          ]
            .filter(Boolean)
            .join(', ') || 'None'}
        />
      </div>

      {/* Deploy mode */}
      <div className="mb-6">
        <p className="label-caps mb-3">Deploy method</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label
            className={[
              'flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-all',
              deployMode === 'zip'
                ? 'border-loom-600 bg-loom-50 ring-1 ring-loom-600/20'
                : 'border-bone-200 hover:border-loom-200',
            ].join(' ')}
          >
            <input
              type="radio"
              name="deployMode"
              value="zip"
              checked={deployMode === 'zip'}
              onChange={() => setDeployMode('zip')}
              className="mt-0.5 accent-loom-600"
            />
            <div>
              <p className="text-sm font-medium text-charcoal-700">Download zip</p>
              <p className="text-xs text-charcoal-500 mt-0.5">
                Get tenant.json + .env in a zip. Run <code className="font-mono text-loom-600">penelope up</code> locally.
              </p>
            </div>
          </label>
          <label
            className={[
              'flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-all',
              deployMode === 'api'
                ? 'border-loom-600 bg-loom-50 ring-1 ring-loom-600/20'
                : 'border-bone-200 hover:border-loom-200',
            ].join(' ')}
          >
            <input
              type="radio"
              name="deployMode"
              value="api"
              checked={deployMode === 'api'}
              onChange={() => setDeployMode('api')}
              className="mt-0.5 accent-loom-600"
            />
            <div>
              <p className="text-sm font-medium text-charcoal-700">Push to instance</p>
              <p className="text-xs text-charcoal-500 mt-0.5">
                POST directly to a running Penelope instance. Requires <code className="font-mono text-loom-600">PENELOPE_INSTANCE_URL</code>.
              </p>
            </div>
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <StepNav
        currentStep={5}
        totalSteps={5}
        onBack={back}
        onNext={handleDeploy}
        nextLabel={deployMode === 'zip' ? 'Download zip' : 'Push to instance'}
        isLastStep
        isLoading={isLoading}
      />
    </div>
  )
}
