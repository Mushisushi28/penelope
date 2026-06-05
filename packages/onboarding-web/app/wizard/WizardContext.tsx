'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type {
  WizardState,
  BusinessBasics,
  HoursConfig,
  PreferencesConfig,
} from './types'

interface WizardContextValue {
  state: WizardState
  goTo: (step: number) => void
  next: () => void
  back: () => void
  setBusiness: (business: Partial<BusinessBasics>) => void
  setVertical: (vertical: string) => void
  setChannelEnabled: (id: string, enabled: boolean) => void
  setChannelValue: (id: string, value: string) => void
  setHours: (hours: Partial<HoursConfig>) => void
  setPreferences: (preferences: Partial<PreferencesConfig>) => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

const initialState: WizardState = {
  step: 1,
  business: {
    name: '',
    ownerName: '',
    location: '',
    phone: '',
    email: '',
    website: '',
    tagline: '',
  },
  vertical: '',
  channels: {
    telegram: { enabled: true, token: '' },
    facebook: { enabled: false, token: '' },
    sms: { enabled: false, token: '' },
    stripe: { enabled: false, token: '' },
    square: { enabled: false, token: '' },
    email: { enabled: false, token: '' },
    instagram: { enabled: false, token: '' },
    'google-reviews': { enabled: false, token: '' },
  },
  hours: {
    preset: 'business',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  },
  preferences: {
    responseStyle: 'friendly',
    autoQuote: true,
    autoBooking: false,
    reviewAsk: true,
  },
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState)

  const goTo = (step: number) =>
    setState((s) => ({ ...s, step: Math.min(Math.max(step, 1), 5) }))

  const next = () =>
    setState((s) => ({ ...s, step: Math.min(s.step + 1, 5) }))

  const back = () =>
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 1) }))

  const setBusiness = (business: Partial<BusinessBasics>) =>
    setState((s) => ({ ...s, business: { ...s.business, ...business } }))

  const setVertical = (vertical: string) =>
    setState((s) => ({ ...s, vertical }))

  const setChannelEnabled = (id: string, enabled: boolean) =>
    setState((s) => ({
      ...s,
      channels: {
        ...s.channels,
        [id]: { ...s.channels[id], enabled },
      },
    }))

  const setChannelValue = (id: string, value: string) =>
    setState((s) => ({
      ...s,
      channels: {
        ...s.channels,
        [id]: { ...s.channels[id], token: value },
      },
    }))

  const setHours = (hours: Partial<HoursConfig>) =>
    setState((s) => ({ ...s, hours: { ...s.hours, ...hours } }))

  const setPreferences = (preferences: Partial<PreferencesConfig>) =>
    setState((s) => ({
      ...s,
      preferences: { ...s.preferences, ...preferences },
    }))

  return (
    <WizardContext.Provider
      value={{
        state,
        goTo,
        next,
        back,
        setBusiness,
        setVertical,
        setChannelEnabled,
        setChannelValue,
        setHours,
        setPreferences,
      }}
    >
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard() {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used inside WizardProvider')
  return ctx
}
