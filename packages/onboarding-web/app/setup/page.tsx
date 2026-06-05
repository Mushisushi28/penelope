import type { Metadata } from 'next'
import { WizardShell } from './WizardShell'

export const metadata: Metadata = {
  title: 'Set up Penelope',
  description: 'Configure your Penelope AI assistant in 5 steps — no CLI required.',
}

export default function SetupPage() {
  return <WizardShell />
}
