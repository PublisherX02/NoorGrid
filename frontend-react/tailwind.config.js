/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0f1a',
          card: '#0d1526',
          panel: '#0f1930',
          elevated: '#131e35',
        },
        accent: '#00ff88',
        secondary: '#06b6d4',
        alert: '#ff3333',
        warn: '#ff9500',
        gold: '#ffd700',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      animation: {
        'live-pulse': 'livePulse 1.5s ease-in-out infinite',
        'blink': 'blink 1.2s step-end infinite',
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        livePulse: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 6px #00ff88' },
          '50%': { opacity: '0.3', boxShadow: '0 0 2px #00ff88' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { textShadow: '0 0 20px rgba(0,255,136,0.4)' },
          '50%': { textShadow: '0 0 40px rgba(0,255,136,0.8), 0 0 80px rgba(0,255,136,0.3)' },
        },
      },
    },
  },
  plugins: [],
}
