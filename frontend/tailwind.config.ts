import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#05070b",
        foreground: "#f8fafc",
        border: "#1f2937",
        muted: "#0f172a",
        accent: "#10b981",
        ring: "#38bdf8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(56, 189, 248, 0.2)",
      },
    },
  },
  plugins: [],
}

export default config
