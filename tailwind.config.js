/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: 'rgb(18 163 227 / <alpha-value>)',
        mesh: {
          bg:  '#090d14',
          bg2: '#0d1420',
          bg3: '#111825',
        },
      },
      fontFamily: {
        mono: ['Space Mono', 'JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
