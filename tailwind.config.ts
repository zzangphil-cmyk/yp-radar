import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 토스증권 스타일: 차콜 베이스 + 토스 블루 강조
        base: {
          DEFAULT: "#16171c",
          900: "#101117",
          800: "#1e2027",
          700: "#272a33",
        },
        // 토스 블루(주 강조)
        toss: {
          DEFAULT: "#3182f6",
          dim: "#2670e8",
          soft: "#4c8dff",
        },
        // 레이더 스코프/국민연금 보조 강조
        radar: {
          DEFAULT: "#16c79a",
          dim: "#0e8f6f",
          glow: "#3ee6bd",
        },
        // 한국식 등락 (토스 정확 색)
        up: "#f04452",
        down: "#4c82fb",
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
        card: "0 1px 2px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
