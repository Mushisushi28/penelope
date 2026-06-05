import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s — Penelope',
    default: 'Penelope — She runs the home while Odysseus is away.',
  },
  description:
    'Set up your AI business assistant in minutes. No CLI required. Answer a few questions, connect your channels, and Penelope handles the rest.',
  openGraph: {
    type: 'website',
    siteName: 'Penelope',
    title: 'Penelope — Small-business AI assistant',
    description:
      'Set up your AI business assistant in minutes. No CLI required.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#2D4A3E',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-bone-50 text-charcoal-600 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
