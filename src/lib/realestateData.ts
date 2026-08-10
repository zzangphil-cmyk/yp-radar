import summary from "@/data/realestate-summary.json";

// 부동산 분석기(81MB 정적 페이지)에서 추출한 홈 시각화용 요약.
// 원본: scripts/build-realestate-summary.mjs
export interface ReRegion {
  metro: string;
  region: string;
  grade: number | null; // 중앙 급지(낮을수록 상위)
  complexes: number;
  households: number;
  sigunguCount: number;
}
export interface ReZone {
  region: string;
  gu: string;
  zone: string;
  pyeong: number; // 평당 매매가 중앙값(만원)
  changePct: number | null;
  saleCount: number | null;
  jeonseRatio: number | null;
}
export interface ReSummary {
  asOf: string | null;
  window: string | null;
  counts: { complexes: number; zones: number; sigungu: number; households: number };
  gradeBands: { band: string; count: number }[];
  gradeCutoffs: { label: string; min: number; max: number; pctFrom: number; pctTo: number }[];
  regions: ReRegion[];
  macro: {
    asOf: string | null;
    status: string | null;
    baseRate: number | null;
    baseRateChange6m: number | null;
    treasury3y: number | null;
    treasury3yChange6m: number | null;
    cpiYoy: number | null;
    creditYoy: number | null;
    series: { ym: string; base: number | null; t3y: number | null; credit: number | null }[];
  };
  zones: {
    count: number;
    medianPyeong: number;
    topPrice: ReZone[];
    topRise: ReZone[];
    topFall: ReZone[];
  };
  coverage: { metro: string; status: string; parsed: number; official: number; sigunguCount: number; framework: string }[];
  source: string;
}

export const realestate = summary as ReSummary;

/** 평당가(만원) → "1억 8,160만" 같은 읽기 쉬운 표기 */
export function fmtPyeong(manwon: number | null): string {
  if (manwon == null) return "-";
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const rest = Math.round(manwon % 10000);
    return rest ? `${eok}억 ${rest.toLocaleString("ko-KR")}만` : `${eok}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

/** 세대수 → "291만" */
export function fmtHouseholds(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return n.toLocaleString("ko-KR");
}

/** 부동산 정적 페이지 경로 */
export const RE_PAGES = {
  market: "/realestate/capital_area_market_analyzer_v3_0.html",
  policy: "/realestate/real_estate_policy_timeline_v1_0.html",
  experts: "/realestate/real_estate_expert_signals_v1_0.html",
} as const;
