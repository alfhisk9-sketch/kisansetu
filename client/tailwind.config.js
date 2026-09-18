/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eaf5f0",
          100: "#cce8dc",
          200: "#9ed3be",
          300: "#65b99a",
          400: "#329b76",
          500: "#16A34A",
          600: "#0B6E4F", // Primary deep agricultural green
          700: "#09583f",
          800: "#074431",
          900: "#053426",
          950: "#021d15",
        },
        accent: {
          50: "#fef9ec",
          100: "#fdf0cd",
          200: "#fbe09b",
          300: "#f8cb5e",
          400: "#F4B942", // Primary Accent Harvest Gold
          500: "#FFD166", // Warm Yellow
          600: "#d99719",
          700: "#ac6f12",
          800: "#8c5614",
          900: "#734515",
        },
        surface: "#FFFFFF",
        page: "#F8FAF8",
        dark: {
          text: "#17201B",
          muted: "#66736B",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(11, 110, 79, 0.05), 0 1px 2px rgba(0, 0, 0, 0.04)",
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(23, 32, 27, 0.05)",
        elevated: "0 10px 15px -3px rgba(11, 110, 79, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)",
        glow: "0 0 20px rgba(11, 110, 79, 0.15)",
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [],
};
