import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        accent: "#e5a00d",
        gold: "#e5a00d",
        danger: "#ef4444",
        // Background & surface
        "bg-primary": "#0f0f0f",
        surface: "#161616",
        "surface-2": "#1e1e1e",
        glass: "rgba(22,22,22,0.85)",
        // Borders
        border: "#252525",
        "border-bright": "#3a3a3a",
        // Text
        text: "#f0f0f0",
        muted: "#6b7280",
      },
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
