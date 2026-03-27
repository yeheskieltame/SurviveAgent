import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'agent-bg': '#0a0e17',
        'agent-card': '#111827',
        'agent-border': '#1e293b',
        'agent-green': '#00ff88',
        'agent-red': '#ff4444',
        'agent-blue': '#3b82f6',
        'agent-yellow': '#fbbf24',
        'agent-purple': '#a855f7',
        'agent-cyan': '#06b6d4',
        'terminal-bg': '#0d1117',
        'terminal-text': '#c9d1d9',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 136, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
