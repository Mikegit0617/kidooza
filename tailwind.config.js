/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Noto Sans", "sans-serif"],
      },
      backgroundImage: {
        "kidooza-gradient": "linear-gradient(to bottom right, #e0f2fe, #f0fdf4)",
      },
    },
  },
  plugins: [],
};
