import panelData from "@/data/nps-panel.json";
import changesData from "@/data/nps-changes.json";
import insightsData from "@/data/nps-insights.json";
import recentData from "@/data/nps-recent.json";
import quadrantData from "@/data/nps-quadrant.json";
import allocationData from "@/data/nps-allocation.json";

// ---------- 타입 ----------
export interface YearVal {
  value: number | null;
  weight: number | null;
  ownership: number | null;
}
export interface Stock {
  name: string;
  slug: string;
  byYear: Record<string, YearVal>;
  inCur: boolean;
  ownDelta: number | null;
  valDelta: number | null;
}
export interface Panel {
  years: number[];
  curYear: number;
  prevYear: number;
  count: number;
  stocks: Stock[];
}
export interface ChangeRow {
  name: string;
  slug: string;
  ownCur: number | null;
  ownPrev: number | null;
  ownDelta: number | null;
  valCur: number | null;
  valDelta: number | null;
}
export interface NewEntry {
  name: string;
  slug: string;
  value: number;
  ownership: number | null;
}
export interface ExitRow {
  name: string;
  slug: string;
  prevValue: number;
  prevOwnership: number | null;
}
export interface TopHolding {
  name: string;
  slug: string;
  value: number;
  ownership: number | null;
  trend: (number | null)[];
}
export interface Changes {
  years: number[];
  curYear: number;
  prevYear: number;
  totals: { year: number; jo: number }[];
  counts: { accumulated: number; reduced: number; newEntries: number; exits: number };
  accumulated: ChangeRow[];
  reduced: ChangeRow[];
  newEntries: NewEntry[];
  exits: ExitRow[];
  topHoldings: TopHolding[];
}
export interface TrendItem {
  name: string;
  slug: string;
  net: number;
  trend: number[];
}
export interface Insights {
  curYear: number;
  prevYear: number;
  years: number[];
  themeBubble: ChangeRow[];
  contrarian: ChangeRow[];
  consecAccum: TrendItem[];
  consecReduce: TrendItem[];
  concentration: { totalJo: number; top10: number; top50: number; top100: number };
}

export interface RecentRow {
  name: string;
  slug: string;
  inPanel: boolean;
  stockCode: string | null;
  date: string; // YYYYMMDD
  ownership: number | null;
  ownDelta: number | null;
  reason: string | null;
}
export interface Recent {
  asOf: string;
  universeAsOf: string;
  source: string;
  counts: { holdings: number; recent: number; recentBuy: number; recentSell: number };
  holdings: RecentRow[];
  recentFilings: RecentRow[];
}

// ---------- 로더 ----------
export const panel = panelData as Panel;
export const changes = changesData as Changes;
export const insights = insightsData as Insights;
export const recent = recentData as Recent;

export interface QuadPoint { name: string; slug: string; od: number; r: number }
export interface QuadInterval { key: string; label: string; from: number; to: number }
export interface QuadrantData { intervals: QuadInterval[]; data: Record<string, QuadPoint[]> }
export const quadrant = quadrantData as QuadrantData;

export interface AllocationAsset { name: string; jo: number[]; pct: number[] }
export interface Allocation {
  source: string;
  asOf: string;
  periods: string[];
  totalsJo: number[];
  assets: AllocationAsset[];
}
export const allocation = allocationData as Allocation;

export function getStock(slug: string): Stock | undefined {
  return panel.stocks.find((s) => s.slug === slug);
}
export function holdingsCur(): Stock[] {
  return panel.stocks.filter((s) => s.inCur);
}
export function allSlugs(): string[] {
  return panel.stocks.map((s) => s.slug);
}

// ---------- 포맷 ----------
export const slugify = (name: string) =>
  name.replace(/\(주\)|주식회사|㈜/g, "").replace(/[\s/\\?#%&]/g, "").trim();

/** 억원 → "23.0조" / "2,305억" */
export function formatEok(eok: number | null): string {
  if (eok == null || !Number.isFinite(eok)) return "-";
  if (Math.abs(eok) >= 10000) return `${(eok / 10000).toFixed(1)}조`;
  return `${Math.round(eok).toLocaleString("ko-KR")}억`;
}
/** "20260623" → "2026.06.23" */
export function formatYmd(ymd: string): string {
  if (!ymd) return "-";
  const d = ymd.replace(/\D/g, "");
  if (d.length < 8) return ymd;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}
export function formatPct(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${v.toFixed(digits)}%`;
}
/** 증감 표시용 부호 문자열 */
export function signed(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}
