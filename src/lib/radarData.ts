import radar from "@/data/radar-frames.json";

export interface RadarStock { code: string; name: string; theme?: string; market?: string }
// [stockIndex, x, y, temp(D²온도 0~1), relVol(평소의 ×배), retPct(등락률 %), d2, topGroup]
//  topGroup: 0 거래량 / 1 고유수익 / 2 변동성 / 3 자금유입 — "무엇이 띄웠나"(최대 기여 피처)
export type Blip = [number, number, number, number, number, number, number, number];
export interface RadarFrame { t: string; b: Blip[] }
export interface RadarData {
  asOf: string;
  source: string;
  interval: string;
  window: string;
  lastTs: string;
  axes?: { x: string; y: string };
  model?: Record<string, unknown>;
  featGroups?: string[];
  stocks: RadarStock[];
  frameCount: number;
  frames: RadarFrame[];
}

export const radarData = radar as unknown as RadarData;

/** 온도(D²)를 띄운 주 원인 라벨 */
export const FEAT_GROUPS = ["거래량", "고유수익", "변동성", "자금유입"];
export function groupLabel(g: number): string {
  return FEAT_GROUPS[g] ?? "복합";
}

/** 경보 패널용 한 줄 근거 — 주 원인 + 거래량/등락 */
export function blipReasons(relVol: number, retPct: number, topGroup?: number): string[] {
  const r: string[] = [];
  if (topGroup != null) r.push(groupLabel(topGroup) + " 주도");
  if (relVol >= 1.5) r.push(`거래량 ${relVol.toFixed(1)}배`);
  if (Math.abs(retPct) >= 2) r.push(`${retPct >= 0 ? "+" : ""}${retPct.toFixed(1)}%`);
  return r.length ? r : ["평소 수준"];
}
