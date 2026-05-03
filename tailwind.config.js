/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        geoverify: {
          dark: '#111111',
          panel: '#1e1e1e',
          accent: '#2ca66f',
          accentHover: '#238a5b',
          malicious: '#f97352',
          pending: '#f2c14e'
        }
      }
    },
  },
  plugins: [],
}
