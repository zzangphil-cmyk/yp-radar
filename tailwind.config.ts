import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 레이더 테마: 베이스(딥 네이비) + radar(틸/그린) 강조
        base: {
          DEFAULT: "#060a12",
          900: "#080d17",
          800: "#0d1422",
          700: "#131c2e",
        },
        radar: {
          DEFAULT: "#16c79a",
          dim: "#0e8f6f",
          glow: "#3ee6bd",
        },
        // 한국식 등락
        up: "#f0616d",
        down: "#4c8dff",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 30px -12px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
} satisfies Config;
