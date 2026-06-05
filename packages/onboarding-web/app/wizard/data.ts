import type { Vertical } from '@/app/components/VerticalCard'
import type { Channel } from '@/app/components/ChannelCard'

export const STEP_LABELS = [
  'Business basics',
  'Your vertical',
  'Connect channels',
  'Hours & preferences',
  'Review & deploy',
]

export const VERTICALS: Vertical[] = [
  {
    id: 'auto-detailing',
    name: 'Auto Detailing',
    icon: '🚗',
    description: 'Mobile and fixed-location vehicle detailing services.',
    tagline: 'Quote, book, and follow up — automatically.',
    sampleProcedures: [
      'Send quote when customer messages with vehicle type + condition',
      'Ask for review 2 days after service completion',
      'Remind customer of upcoming appointment 24h before',
    ],
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    icon: '🌿',
    description: 'Lawn care, tree services, and garden maintenance.',
    tagline: 'Keep the grass green and your inbox empty.',
    sampleProcedures: [
      'Reply with seasonal service availability',
      'Schedule recurring lawn care reminders',
      'Send estimate based on yard size description',
    ],
  },
  {
    id: 'cleaning',
    name: 'Cleaning Services',
    icon: '🧹',
    description: 'Residential and commercial cleaning.',
    tagline: 'Bookings in, complaints out.',
    sampleProcedures: [
      'Ask qualifying questions (sqft, bedrooms, frequency)',
      'Send pricing tiers based on scope',
      'Follow up with review request after job',
    ],
  },
  {
    id: 'trades',
    name: 'Trades & Repairs',
    icon: '🔧',
    description: 'Plumbing, electrical, HVAC, and general contracting.',
    tagline: 'Triage, schedule, invoice — on autopilot.',
    sampleProcedures: [
      'Triage urgency: emergency vs scheduled visit',
      'Capture issue description and photos',
      'Send appointment confirmation and tech bio',
    ],
  },
  {
    id: 'food',
    name: 'Food & Catering',
    icon: '🍽️',
    description: 'Catering, pop-ups, meal prep, and specialty food.',
    tagline: 'Orders in while you focus on the kitchen.',
    sampleProcedures: [
      'Respond to menu inquiries with PDF or link',
      'Capture event date, headcount, dietary needs',
      'Send deposit invoice automatically',
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness & Wellness',
    icon: '💪',
    description: 'Personal training, yoga, massage, and wellness studios.',
    tagline: 'Fill your schedule without lifting a finger.',
    sampleProcedures: [
      'Handle new-client intake questions',
      'Book sessions and send calendar invites',
      'Send post-session check-in and rebooking nudge',
    ],
  },
  {
    id: 'retail',
    name: 'Local Retail',
    icon: '🛍️',
    description: 'Boutiques, specialty shops, and local e-commerce.',
    tagline: 'Customer service that never goes off shift.',
    sampleProcedures: [
      'Answer stock and pricing questions',
      'Handle order status and return requests',
      'Promote new arrivals to returning customers',
    ],
  },
  {
    id: 'other',
    name: 'Other',
    icon: '✨',
    description: 'Any other small business type.',
    tagline: 'Tell us your workflows — Penelope will adapt.',
    sampleProcedures: [
      'Answer common questions from your FAQ',
      'Capture lead info and qualify interest',
      'Notify you of high-priority enquiries',
    ],
  },
]

export const CHANNELS: Channel[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    description: 'Owner notifications + customer-facing bot.',
    required: true,
    inputType: 'token',
    placeholder: '1234567890:ABCdef...',
    helpUrl: 'https://core.telegram.org/bots/tutorial#getting-ready',
  },
  {
    id: 'facebook',
    name: 'Facebook Messenger',
    icon: '💬',
    description: 'Reply to Facebook Page DMs automatically.',
    inputType: 'token',
    placeholder: 'Page access token',
    helpUrl: 'https://developers.facebook.com/docs/messenger-platform/getting-started/app-setup',
  },
  {
    id: 'sms',
    name: 'SMS (Twilio)',
    icon: '📱',
    description: 'Two-way SMS with customers via Twilio.',
    inputType: 'token',
    placeholder: 'TWILIO_AUTH_TOKEN',
    helpUrl: 'https://www.twilio.com/docs/usage/api',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: '💳',
    description: 'Accept payments and send invoices.',
    inputType: 'token',
    placeholder: 'sk_live_...',
    helpUrl: 'https://stripe.com/docs/keys',
  },
  {
    id: 'square',
    name: 'Square',
    icon: '⬛',
    description: 'POS integration — trigger review asks after payments.',
    inputType: 'token',
    placeholder: 'Square access token',
    helpUrl: 'https://developer.squareup.com/docs/build-basics/access-tokens',
  },
  {
    id: 'email',
    name: 'Email (SMTP)',
    icon: '📧',
    description: 'Send confirmations and follow-ups via email.',
    inputType: 'token',
    placeholder: 'smtp://user:pass@host:587',
  },
  {
    id: 'instagram',
    name: 'Instagram DMs',
    icon: '📷',
    description: 'Auto-reply to Instagram Direct Messages.',
    inputType: 'oauth',
    helpUrl: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    id: 'google-reviews',
    name: 'Google Reviews',
    icon: '⭐',
    description: 'Notify you of new reviews; draft reply suggestions.',
    inputType: 'oauth',
    helpUrl: 'https://developers.google.com/my-business/reference/rest',
  },
]

export const HOURS_OPTIONS = [
  { value: 'always', label: 'Always on (24/7)', description: 'Penelope responds any time.' },
  {
    value: 'business',
    label: 'Business hours',
    description: 'Mon–Fri 9am–6pm. Queues messages overnight.',
  },
  {
    value: 'extended',
    label: 'Extended hours',
    description: 'Mon–Sat 8am–8pm.',
  },
  {
    value: 'weekdays',
    label: 'Weekdays only',
    description: 'Mon–Fri 9am–5pm. Holds weekend messages.',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Configure hours in your tenant.json after setup.',
  },
]

export const RESPONSE_STYLES = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Formal, precise, business-appropriate.',
    example: 'Thank you for reaching out. We would be happy to assist you with your request…',
  },
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Warm, conversational, human.',
    example: 'Hey! Thanks for getting in touch — would love to help. Here is what we can do…',
  },
  {
    value: 'brief',
    label: 'Brief',
    description: 'Short and direct. Minimum words, maximum clarity.',
    example: 'Hi! Available Fri or Sat. Which works for you?',
  },
]
