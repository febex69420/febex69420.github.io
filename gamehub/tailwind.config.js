/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Russo One"', 'system-ui', 'sans-serif'],
        sans: ['"Chakra Petch"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Surfaces (dark-first)
        base: '#08080c',
        surface: '#0f0f17',
        elevated: '#16161f',
        // Brand
        primary: {
          DEFAULT: '#7c5cff',
          soft: '#9b82ff',
          deep: '#5b3fd6',
        },
        accent: {
          DEFAULT: '#22d3ee',
          soft: '#67e8f9',
        },
        rose: {
          DEFAULT: '#fb5d8a',
        },
        // Semantic
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f43f5e',
        info: '#60a5fa',
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(124, 92, 255, 0.55)',
        'glow-accent': '0 0 24px -4px rgba(34, 211, 238, 0.5)',
        card: '0 8px 32px -8px rgba(0, 0, 0, 0.6)',
      },
      backgroundImage: {
        'mesh-violet':
          'radial-gradient(at 0% 0%, rgba(124,92,255,0.18) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(34,211,238,0.12) 0px, transparent 50%), radial-gradient(at 80% 100%, rgba(251,93,138,0.12) 0px, transparent 50%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(52,211,153,0.5)' },
          '70%': { boxShadow: '0 0 0 6px rgba(52,211,153,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(52,211,153,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 240ms cubic-bezier(0.16,1,0.3,1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s infinite',
      },
    },
  },
  plugins: [],
};
