/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep forest green — primary brand color.
        forest: {
          50: "#eef6f0",
          100: "#d6e8dc",
          200: "#aed0bb",
          300: "#7fb494",
          400: "#529372",
          500: "#357857",
          600: "#245e44",
          700: "#1c4a37",
          800: "#163a2c",
          900: "#0f2a20",
        },
        // Warm gold — accent color.
        gold: {
          50: "#fbf6ea",
          100: "#f5e8c8",
          200: "#ecd196",
          300: "#e0b352",
          400: "#cf9a34",
          500: "#b07e28",
          600: "#8c6220",
        },
        // Parchment / cream neutrals for surfaces and page background.
        parchment: {
          50: "#faf8f3",
          100: "#f4f1e8",
          200: "#e9e4d6",
          300: "#d9d2be",
        },
        // Aliases kept so existing brand-*/accent-* references stay valid.
        brand: {
          50: "#eef6f0",
          400: "#529372",
          500: "#357857",
          600: "#245e44",
          700: "#1c4a37",
        },
        accent: {
          400: "#cf9a34",
          500: "#e0b352",
        },
        // `ink` repurposed as warm light neutrals so any leftover
        // bg-ink-*/text-ink-* utilities render sensibly on the light theme.
        ink: {
          600: "#d6d3ce",
          700: "#e7e5df",
          800: "#ffffff",
          900: "#f4f1e8",
          950: "#faf8f3",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(20,55,40,0.04), 0 12px 30px -18px rgba(20,55,40,0.22)",
        card: "0 2px 6px rgba(20,55,40,0.06), 0 18px 40px -24px rgba(20,55,40,0.28)",
        glow: "0 18px 40px -18px rgba(36,94,68,0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
