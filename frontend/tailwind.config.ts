import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        lane: {
          50: '#f8f5ee',
          100: '#ede4d5',
          200: '#dcc7aa',
          300: '#c9a070',
          400: '#b67c44',
          500: '#8f5a2a',
          600: '#6e431e',
          700: '#4d2e13',
          800: '#2a1809',
          900: '#140b04'
        },
        mint: '#c6f0db',
        aqua: '#76d7d3',
        coral: '#ff8c69'
      },
      boxShadow: {
        panel: '0 24px 80px rgba(21, 12, 5, 0.18)'
      }
    },
  },
  plugins: [],
};

export default config;
