import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1B6B4A', light: '#E8F5EE', mid: '#C2E5D3', dark: '#145236' },
        warn: { DEFAULT: '#E8950A', bg: '#FFF8E7', border: '#FCEBC5' },
        danger: { DEFAULT: '#DC3545', bg: '#FFF0F0' },
        ok: '#10B981',
        pending: '#F59E0B',
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        mobile: '430px',
      },
    },
  },
  plugins: [],
}
export default config
