import radar from "@/data/radar-frames.json";

export interface RadarStock { code: string; name: string; theme?: string }
// [stockIndex, x, y, anomaly, relVol(평소의 ×배), retPct(등락률 %)]
export type Blip = [number, number, number, number, number, number];
export interface RadarFrame { t: string; b: Blip[] }
export interface RadarData {
  asOf: string;
  source: string;
  interval: string;
  window: string;
  lastTs: string;
  axes?: { x: string; y: string };
  model?: Record<string, unknown>;
  stocks: RadarStock[];
  frameCount: number;
  frames: RadarFrame[];
}

export const radarData = radar as unknown as RadarData;

/** 경보 패널용 한 줄 근거 — relVol(평소의 ×배), retPct(등락률 %) */
export function blipReasons(relVol: number, retPct: number): string[] {
  const r: string[] = [];
  if (relVol >= 1.5) r.push(`거래량 ${relVol.toFixed(1)}배`);
  else if (relVol <= 0.6) r.push(`거래량 ${relVol.toFixed(1)}배`);
  if (Math.abs(retPct) >= 2) r.push(`${retPct >= 0 ? "+" : ""}${retPct.toFixed(1)}%`);
  return r.length ? r : ["평소 수준"];
}
