import { etfStocks } from "./etfData";
import { panel, slugify } from "./npsData";

// ETF 실시간 자금흐름(flow) × 국민연금 지분율 변화(ownDelta)를 종목 단위로 교차
export interface CrossItem {
  name: string;
  code: string; // ETF 종목코드 (/etf/stock/[code])
  npsSlug: string; // 국민연금 종목 (/nps/stock/[slug])
  etfFlow: number; // ETF 3개월 순유입(억)
  npsOwnDelta: number; // 국민연금 지분율 증감(%p, 2023→2024)
}
export interface CrossSignal {
  convergeBuy: CrossItem[]; // 둘 다 매수
  convergeSell: CrossItem[]; // 둘 다 매도
  divergeHotEtf: CrossItem[]; // ETF는 유입 ↔ 국민연금은 축소 (테마 과열 주의)
  divergeContra: CrossItem[]; // ETF는 유출 ↔ 국민연금은 매집 (역발상)
  matched: number;
}

const FLOW_BAND = 100; // 억
const OWN_BAND = 0.05; // %p

function build(): CrossSignal {
  const npsMap = new Map(panel.stocks.map((s) => [s.slug, s]));
  const out: CrossSignal = { convergeBuy: [], convergeSell: [], divergeHotEtf: [], divergeContra: [], matched: 0 };
  for (const e of etfStocks.stocks) {
    const nps = npsMap.get(slugify(e.name));
    if (!nps || nps.ownDelta == null) continue;
    out.matched++;
    const ef = e.flow, od = nps.ownDelta;
    if (Math.abs(ef) < FLOW_BAND || Math.abs(od) < OWN_BAND) continue;
    const item: CrossItem = { name: e.name, code: e.code, npsSlug: nps.slug, etfFlow: ef, npsOwnDelta: od };
    if (ef > 0 && od > 0) out.convergeBuy.push(item);
    else if (ef < 0 && od < 0) out.convergeSell.push(item);
    else if (ef > 0 && od < 0) out.divergeHotEtf.push(item);
    else out.divergeContra.push(item);
  }
  for (const k of ["convergeBuy", "convergeSell", "divergeHotEtf", "divergeContra"] as const)
    out[k].sort((a, b) => Math.abs(b.etfFlow) - Math.abs(a.etfFlow));
  return out;
}

export const cross = build();
