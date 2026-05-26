/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        'octopus-blue': '#1e3a8a',
        'octopus-gold': '#d4af37',
      }
    },
  },
  plugins: [],
}