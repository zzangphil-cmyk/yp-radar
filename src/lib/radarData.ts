import radar from "@/data/radar-frames.json";

export interface RadarStock { code: string; name: string; theme?: string }
// [stockIndex, x, y, anomaly, volZ(집단대비σ), mom%]
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

/** 경보 패널용 한 줄 근거 */
export function blipReasons(volZ: number, mom: number): string[] {
  const r: string[] = [];
  if (Math.abs(volZ) >= 2) r.push(`거래량 ${volZ >= 0 ? "+" : ""}${volZ.toFixed(1)}σ`);
  if (Math.abs(mom) >= 0.15) r.push(`${mom >= 0 ? "+" : ""}${mom.toFixed(2)}%`);
  return r.length ? r : ["정상 범위"];
}
