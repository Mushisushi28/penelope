export interface BusinessBasics {
  name: string
  ownerName: string
  location: string
  phone: string
  email: string
  website: string
  tagline: string
}

export interface ChannelConfig {
  enabled: boolean
  token: string
}

export interface HoursConfig {
  preset: string
  timezone: string
}

export interface PreferencesConfig {
  responseStyle: string
  autoQuote: boolean
  autoBooking: boolean
  reviewAsk: boolean
}

export interface WizardState {
  step: number
  business: BusinessBasics
  vertical: string
  channels: Record<string, ChannelConfig>
  hours: HoursConfig
  preferences: PreferencesConfig
}

export interface TenantConfig {
  id: string
  schemaVersion: string
  generatedAt: string
  business: BusinessBasics & { vertical: string }
  channels: Record<string, ChannelConfig>
  hours: HoursConfig
  preferences: PreferencesConfig
}
