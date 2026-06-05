// inbox/channel-icon.js — SVG channel icons (lucide-style, 16x16)

const ICONS = {
  'telegram': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 7.2L11.5 4l-1.8 7.5-2.5-2.2-2.2 1.7" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/></svg>`,
  'telegram-owner': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 7.2L11.5 4l-1.8 7.5-2.5-2.2-2.2 1.7" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/></svg>`,
  'fb-messenger': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5C4.41 1.5 1.5 4.19 1.5 7.5c0 1.73.76 3.28 1.97 4.37V14l2.36-1.3c.69.19 1.41.3 2.17.3 3.59 0 6.5-2.69 6.5-6S11.59 1.5 8 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 9l2-3 2 2 2-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  'sms': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 13.5l1-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5 9H11M5 6.5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  'email': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 5.5L8 9.5l6.5-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  'imap-smtp': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 5.5L8 9.5l6.5-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  'instagram': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="13" height="13" rx="3.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="4.5" r="0.9" fill="currentColor"/></svg>`,
  'whatsapp': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5c-3.59 0-6.5 2.91-6.5 6.5 0 1.19.32 2.3.88 3.26L1.5 14.5l3.36-.87A6.46 6.46 0 008 14.5c3.59 0 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  'whatsapp-business': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5c-3.59 0-6.5 2.91-6.5 6.5 0 1.19.32 2.3.88 3.26L1.5 14.5l3.36-.87A6.46 6.46 0 008 14.5c3.59 0 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  'loom-a2a': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M6 8h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};

const CHANNEL_COLORS = {
  'telegram':          '#2a9fd6',
  'telegram-owner':    '#2a9fd6',
  'fb-messenger':      '#0a7cff',
  'sms':               '#4e8a42',
  'email':             '#b87333',
  'imap-smtp':         '#b87333',
  'instagram':         '#c13584',
  'whatsapp':          '#25d366',
  'whatsapp-business': '#25d366',
  'loom-a2a':          '#9b72cf',
};

export function channelIcon(channel, colored = false) {
  const svg = ICONS[channel] || ICONS['sms'];
  if (colored) {
    const color = CHANNEL_COLORS[channel] || 'var(--penelope-shuttle)';
    return svg.replace(/stroke="currentColor"/g, `stroke="${color}"`).replace(/fill="currentColor"/g, `fill="${color}"`);
  }
  return svg;
}

export function channelColor(channel) {
  return CHANNEL_COLORS[channel] || 'var(--penelope-shuttle)';
}

export function channelLabel(channel) {
  const LABELS = {
    'telegram':          'Telegram',
    'telegram-owner':    'Telegram',
    'fb-messenger':      'Messenger',
    'sms':               'SMS',
    'email':             'Email',
    'imap-smtp':         'Email',
    'instagram':         'Instagram',
    'whatsapp':          'WhatsApp',
    'whatsapp-business': 'WhatsApp Biz',
    'loom-a2a':          'Loom A2A',
  };
  return LABELS[channel] || channel;
}
