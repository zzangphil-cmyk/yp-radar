import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 토스증권 다크: 거의 검정 베이스 + 경계선 없는 카드(밝기 차로 구분)
        base: {
          DEFAULT: "#101013",
          900: "#0c0d10",
          800: "#17181d", // 카드
          700: "#22242b", // 호버·상승 요소
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
