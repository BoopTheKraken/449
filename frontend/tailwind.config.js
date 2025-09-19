/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cream': '#F5EFE6',
        'beige': '#E8DFCA',
        'primary': '#6D94C5',
        'light-blue': '#CBDCEB',
      }
    },
  },
  plugins: [],
}