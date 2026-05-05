/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"AirSignal Text"', '"Segoe UI"', 'Arial', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"AirSignal Display"', '"Segoe UI"', 'Arial', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"AirSignal Mono"', 'Consolas', '"SFMono-Regular"', 'Menlo', 'monospace'],
      },
      colors: {
        ivory: '#07111F',
        paper: '#0C1A2E',
        ink: '#F6FAFF',
        graphite: '#A8B5C7',
        signal: {
          red: '#FF5F57',
          amber: '#F6B448',
          green: '#3AD38B',
          blue: '#6EA8FF',
        },
      },
      boxShadow: {
        soft: '0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 45px -30px rgba(0,0,0,0.72)',
        panel: '0 1px 0 rgba(255,255,255,0.08) inset, 0 26px 80px -34px rgba(0,0,0,0.86), 0 10px 28px -18px rgba(0,0,0,0.72)',
      },
    },
  },
  plugins: [],
}
