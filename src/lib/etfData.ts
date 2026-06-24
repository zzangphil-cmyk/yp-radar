import etfData from "@/data/etf.json";
import etfStocksData from "@/data/etf-stocks.json";

export interface Etf {
  rank: number;
  code: string;
  name: string;
  theme: string;
  price: number | null;
  changeRate: number | null;
  nav: number | null;
  ret3m: number | null; // 3개월 수익률 %
  volume: number | null; // 거래량(주)
  amount: number | null; // 거래대금(백만원)
  marketSum: number | null; // 순자산/시총(억원)
}
export interface EtfTheme {
  theme: string;
  count: number;
  amount: number; // 백만원 합
  avgRet: number | null;
  etfs: string[];
}
export interface EtfData {
  source: string;
  asOf: string;
  asOfTime: string;
  universe: number;
  eligible: number;
  excluded: number;
  topN: number;
  etfs: Etf[];
  themes: EtfTheme[];
}

export const etf = etfData as EtfData;

export interface EtfStock {
  code: string;
  name: string;
  etfCount: number;
  exposure: number; // ETF 노출 규모(억) = Σ 비중×순자산
  flow: number; // ETF 3개월 순유입(억) = Σ 비중×순유입
  themes: string[];
  etfs: { name: string; weight: number }[];
}
export interface EtfStocksData {
  asOf: string;
  source: string;
  count: number;
  etfCount: number;
  stocks: EtfStock[];
}
export const etfStocks = etfStocksData as EtfStocksData;

export function getEtfStock(code: string): EtfStock | undefined {
  return etfStocks.stocks.find((s) => s.code === code);
}
export function allEtfStockCodes(): string[] {
  return etfStocks.stocks.map((s) => s.code);
}

/** 억원 → "1.2조" / "3,400억" */
export function fmtEok(eok: number | null): string {
  if (eok == null || !Number.isFinite(eok)) return "-";
  if (Math.abs(eok) >= 10000) return `${(eok / 10000).toFixed(1)}조`;
  return `${Math.round(eok).toLocaleString("ko-KR")}억`;
}
/** 거래대금(백만원) → 억 단위 표시 */
export function fmtAmt(baekman: number | null): string {
  if (baekman == null) return "-";
  return fmtEok(baekman / 100);
}
/** 거래량(주) → "44.4M" / "1,234주" */
export function fmtVol(v: number | null): string {
  if (v == null) return "-";
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString("ko-KR");
}
