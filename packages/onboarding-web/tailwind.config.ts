import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Penelope brand palette
        loom: {
          50:  '#f0f4f2',
          100: '#d6e5de',
          200: '#aecbbc',
          300: '#82ae98',
          400: '#5d9178',
          500: '#3d7560',
          600: '#2D4A3E', // primary
          700: '#243d33',
          800: '#1a2e26',
          900: '#111e18',
        },
        thread: {
          50:  '#fdf8ee',
          100: '#f7ead0',
          200: '#efd4a0',
          300: '#e5ba6e',
          400: '#d9a245',
          500: '#C9983F', // accent
          600: '#a87b32',
          700: '#856126',
          800: '#62481b',
          900: '#3f2e10',
        },
        shuttle: {
          50:  '#faf4f1',
          100: '#f1e0d6',
          200: '#e3bfac',
          300: '#d49b82',
          400: '#bc775a',
          500: '#A0522D', // copper CTA
          600: '#844424',
          700: '#6a361b',
          800: '#4f2812',
          900: '#341909',
        },
        bone: {
          50:  '#FDFCFA', // lightest surface
          100: '#F6F3EC', // card bg
          200: '#ede8dc',
          300: '#e0d9c8',
          400: '#cfc5ab',
          500: '#b8a98a',
          600: '#9a8a6a',
          700: '#7a6c4e',
          800: '#5a4f36',
          900: '#3a3320',
        },
        charcoal: {
          50:  '#f4f4f4',
          100: '#e0e0e0',
          200: '#bcbcbc',
          300: '#949494',
          400: '#6e6e6e',
          500: '#4e4e4e',
          600: '#383838', // body text
          700: '#2a2a2a',
          800: '#1c1c1c',
          900: '#111111',
        },
      },
      fontFamily: {
        serif:  ['Cormorant Garamond', 'Georgia', 'serif'],
        sans:   ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono:   ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.5s ease-out forwards',
        'slide-up':   'slideUp 0.4s ease-out forwards',
        'thread-draw':'threadDraw 0.8s ease-in-out forwards',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        threadDraw: {
          '0%':   { strokeDashoffset: '100%' },
          '100%': { strokeDashoffset: '0%' },
        },
        pulseGold: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}

export default config
