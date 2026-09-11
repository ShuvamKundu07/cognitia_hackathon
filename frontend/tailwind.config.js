/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        safety: {
          critical: '#EF4444',
          'critical-bg': '#450A0A',
          'critical-border': '#DC2626',
          high: '#F97316',
          'high-bg': '#431407',
          'high-border': '#EA580C',
          medium: '#EAB308',
          'medium-bg': '#422006',
          'medium-border': '#CA8A04',
          low: '#38BDF8',
          'low-bg': '#082F49',
          'low-border': '#0284C7',
          safe: '#22C55E',
          'safe-bg': '#052E16',
          'safe-border': '#16A34A',
        },
        surface: {
          darkest: '#05070A',
          card: '#0D1117',
          elevated: '#161B22',
          border: '#30363D',
          hover: '#21262D',
        }
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash-border': 'flashBorder 1s infinite alternate',
      },
      keyframes: {
        flashBorder: {
          '0%': { borderColor: '#EF4444', boxShadow: '0 0 15px rgba(239, 68, 68, 0.6)' },
          '100%': { borderColor: '#7F1D1D', boxShadow: '0 0 2px rgba(239, 68, 68, 0.2)' },
        }
      }
    },
  },
  plugins: [],
}

