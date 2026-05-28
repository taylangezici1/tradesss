import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0d1117",
          elev: "#161b22",
          elev2: "#1f2630",
        },
        edge: "#2a313c",
        ink: {
          DEFAULT: "#e6edf3",
          dim: "#8b949e",
        },
        signal: {
          green: "#3fb950",
          red: "#f85149",
          amber: "#d29922",
          blue: "#58a6ff",
          accent: "#7c3aed",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [typography],
};
export default config;
