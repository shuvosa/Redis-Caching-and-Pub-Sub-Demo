// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // This line tells Tailwind to scan all JS/JSX/TS/TSX files in src/
  ],
  theme: {
    extend: {
      fontFamily: { // Add the Inter font if you want to use it
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}