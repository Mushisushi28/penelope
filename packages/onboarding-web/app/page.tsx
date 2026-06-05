import Link from 'next/link'
import { LogoWordmark } from '@/app/components/LogoWordmark'

const VERTICALS = [
  '🚗 Auto Detailing',
  '🌿 Landscaping',
  '🧹 Cleaning',
  '🔧 Trades & Repairs',
  '🍽️ Food & Catering',
  '💪 Fitness',
  '🛍️ Retail',
  '✨ & more',
]

const FEATURES = [
  {
    icon: '💬',
    title: 'Multi-channel inbox',
    description: 'Telegram, Facebook Messenger, SMS, Instagram — one assistant, every channel.',
  },
  {
    icon: '⚡',
    title: 'Instant quotes',
    description: 'Penelope reads your pricing rules and responds to estimate requests automatically.',
  },
  {
    icon: '📅',
    title: 'Appointment booking',
    description: 'Customers book directly in the chat. Penelope holds the calendar.',
  },
  {
    icon: '⭐',
    title: 'Review pipeline',
    description: 'Ask for Google reviews at exactly the right moment — 2 days post-service.',
  },
  {
    icon: '💳',
    title: 'Payment integration',
    description: 'Stripe and Square connected. Accept deposits and track completions.',
  },
  {
    icon: '🔔',
    title: 'Owner notifications',
    description: 'Escalations land in your Telegram instantly. You stay in control.',
  },
  {
    icon: '🧵',
    title: 'Custom procedures',
    description: 'Write plain-language rules. Penelope follows them exactly, every time.',
  },
  {
    icon: '🔒',
    title: 'Self-hosted',
    description: 'Your data, your server. Open source, no subscription lock-in.',
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Fill in the wizard',
    description: 'Five steps. No CLI, no YAML, no config files to hand-edit.',
  },
  {
    step: '02',
    title: 'Connect your channels',
    description: 'Paste a Telegram bot token. Add Facebook, SMS, Stripe — whatever you use.',
  },
  {
    step: '03',
    title: 'Download your config',
    description: 'Get a ready-to-run tenant.json and .env. No uploads, no cloud dependency.',
  },
  {
    step: '04',
    title: 'Run penelope up',
    description: 'One command. Penelope loads your config and starts responding in seconds.',
  },
  {
    step: '05',
    title: 'Customize procedures',
    description: 'Edit your .yaml procedure files to match exactly how your business works.',
  },
]

export default function LandingPage() {
  return (
    <>
      {/* Nav */}
      <nav className="border-b border-bone-200 bg-bone-50/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <LogoWordmark size="sm" />
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/Mushisushi28/penelope"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors"
            >
              GitHub
            </a>
            <Link href="/setup" className="btn-thread text-sm px-4 py-2">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="loom-bg relative overflow-hidden">
        {/* Loom grid texture */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(201,152,63,0.4) 39px, rgba(201,152,63,0.4) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(201,152,63,0.4) 39px, rgba(201,152,63,0.4) 40px)',
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-5xl mx-auto px-6 py-20 sm:py-32">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <span className="label-caps-accent text-thread-400">Small business AI</span>
              <span className="text-thread-600" aria-hidden="true">—</span>
              <span className="label-caps text-loom-300">Open source</span>
            </div>

            <h1
              className="display-serif text-5xl sm:text-6xl lg:text-7xl text-bone-50 leading-tight mb-6"
              style={{ fontStyle: 'italic' }}
            >
              She runs the home while{' '}
              <span className="text-thread-400 not-italic">Odysseus</span> is away.
            </h1>

            <p className="text-loom-200 text-lg sm:text-xl mb-10 max-w-xl leading-relaxed font-light">
              Penelope is an AI assistant for small businesses. She handles your inbox, quotes
              jobs, books appointments, and asks for reviews — so you can focus on the work.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link href="/setup" className="btn-thread text-base px-7 py-3.5">
                Set up in 5 minutes
              </Link>
              <a
                href="https://github.com/Mushisushi28/penelope"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-loom-300 hover:text-bone-50 transition-colors flex items-center gap-1.5"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                View on GitHub
              </a>
            </div>
          </div>

          {/* Terminal preview */}
          <div className="mt-14 max-w-lg">
            <div className="terminal text-xs">
              <span className="text-loom-400">$</span> npx @penelope/cli init{'\n'}
              <span className="text-thread-400">→</span> loading wizard at{' '}
              <span className="underline text-bone-200">localhost:3000/setup</span>
              {'\n'}
              <span className="text-thread-400">→</span> vertical: auto-detailing{'\n'}
              <span className="text-thread-400">→</span> channels: telegram, facebook, stripe{'\n'}
              <span className="text-loom-400">✓</span>{' '}
              <span className="text-bone-50">penelope is ready.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Verticals strip */}
      <section className="border-y border-bone-200 bg-bone-100 py-4 overflow-x-auto">
        <div className="flex items-center gap-2 px-6 max-w-5xl mx-auto">
          <span className="label-caps text-charcoal-400 flex-shrink-0 mr-2">Built for</span>
          {VERTICALS.map((v) => (
            <span
              key={v}
              className="flex-shrink-0 px-3 py-1 rounded-full bg-bone-50 border border-bone-200 text-xs text-charcoal-600 whitespace-nowrap"
            >
              {v}
            </span>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
        <div className="mb-12 text-center">
          <p className="label-caps-accent mb-3">What Penelope does</p>
          <h2 className="display-serif text-4xl sm:text-5xl text-loom-800">
            Your business, automated.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card group hover:shadow-md hover:border-loom-200 transition-all">
              <div className="text-2xl mb-3" aria-hidden="true">{f.icon}</div>
              <h3 className="font-sans font-medium text-sm text-charcoal-700 mb-1.5">{f.title}</h3>
              <p className="text-xs text-charcoal-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-bone-100 border-y border-bone-200">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          <div className="mb-12 text-center">
            <p className="label-caps-accent mb-3">Setup</p>
            <h2 className="display-serif text-4xl sm:text-5xl text-loom-800">
              From zero to running in minutes.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="text-center sm:text-left">
                <div
                  className="display-serif text-5xl text-thread-300 leading-none mb-3"
                  aria-hidden="true"
                >
                  {s.step}
                </div>
                <h3 className="font-sans font-medium text-sm text-charcoal-700 mb-1">{s.title}</h3>
                <p className="text-xs text-charcoal-500 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="loom-bg">
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <h2
            className="display-serif text-4xl sm:text-5xl text-bone-50 mb-4 leading-tight"
            style={{ fontStyle: 'italic' }}
          >
            Ready to hand over the inbox?
          </h2>
          <p className="text-loom-200 mb-8 text-lg font-light">
            No subscription. No cloud lock-in. Just open source software that works.
          </p>
          <Link href="/setup" className="btn-thread text-base px-8 py-4 inline-flex">
            Start setup — it takes 5 minutes
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-bone-200 bg-bone-50 py-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <LogoWordmark size="sm" showTagline />
          <div className="flex items-center gap-6 text-xs text-charcoal-400">
            <a
              href="https://github.com/Mushisushi28/penelope"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-charcoal-600 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/Mushisushi28/penelope/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-charcoal-600 transition-colors"
            >
              License
            </a>
            <Link href="/setup" className="hover:text-charcoal-600 transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </>
  )
}
