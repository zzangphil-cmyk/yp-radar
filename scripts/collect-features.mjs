// [SBV — 데이터 최대 수집] 종목별 Stock Behavior Vector 원료 수집
//  토스 API: 일봉 OHLCV(200일) + 마스터(시총·레버리지) + 호가창(스냅샷) + 체결(스냅샷)
//  → data/stock-features.json (피처 행렬). 호가/체결은 스냅샷이라 매일 폴링·누적 전제.
import fs from "node:fs";
import path from "node:path";
import { tossGet, stocksBatch, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) { console.error("토스 키 없음(.env.local)"); process.exit(0); }

const stocksData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const TOPN = Number(process.env.TOPN) || stocksData.stocks.length; // 기본 전체(441)
const universe = stocksData.stocks.slice(0, TOPN).map((s) => ({ code: s.code, name: s.name, theme: s.themes?.[0] ?? "기타" }));
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

async function candles1d(code) { const j = await tossGet(`/api/v1/candles?symbol=${code}&interval=1d&count=200`); return (j.result && j.result.candles) || []; }
async function orderbook(code) { try { const j = await tossGet(`/api/v1/orderbook?symbol=${code}`); return j.result || null; } catch { return null; } }
async function trades(code) { try { const j = await tossGet(`/api/v1/trades?symbol=${code}`); return j.result || []; } catch { return []; } }

console.log("마스터 수집...");
const master = await stocksBatch(universe.map((u) => u.code));

const out = {};
let done = 0;
for (const u of universe) {
  let bars = [], ob = null, tr = [];
  try { bars = (await candles1d(u.code)).slice().reverse(); } catch {} // 과거→최신
  await sleep(110); ob = await orderbook(u.code);
  await sleep(110); tr = await trades(u.code);
  await sleep(110);

  const f = { code: u.code, name: u.name, theme: u.theme };
  const m = master[u.code];
  if (bars.length >= 60) {
    const C = bars.map((b) => num(b.closePrice)), O = bars.map((b) => num(b.openPrice));
    const H = bars.map((b) => num(b.highPrice)), L = bars.map((b) => num(b.lowPrice)), V = bars.map((b) => num(b.volume));
    const n = C.length, c = C[n - 1], pc = C[n - 2] || c;
    const rets = C.map((v, i) => (i === 0 ? 0 : (v - C[i - 1]) / (C[i - 1] || 1)));
    const ret = (k) => (C[n - 1] - C[n - 1 - k]) / (C[n - 1 - k] || 1) * 100; // k일 수익률%
    // G1 가격액션
    f.gap = r3((O[n - 1] - pc) / pc * 100);                         // 갭%
    f.range = r3((H[n - 1] - L[n - 1]) / pc * 100);                 // 일중 레인지%
    f.body = r3((C[n - 1] - O[n - 1]) / ((H[n - 1] - L[n - 1]) || 1)); // 캔들 몸통비
    // G2 거래량
    f.relVol = r3((V[n - 1] + 1) / (median(V.slice(-20)) + 1));      // 평소 대비 배수
    f.turnover = r3(c * V[n - 1] / 1e8);                            // 거래대금(억)
    // G3 변동성
    const vol20 = std(rets.slice(-20)) * 100, vol60 = std(rets.slice(-60)) * 100;
    f.vol20 = r3(vol20); f.volRatio = r3(vol20 / (vol60 || 1));
    const atr = mean(bars.slice(-14).map((b) => (num(b.highPrice) - num(b.lowPrice)))) / (pc || 1) * 100;
    f.atr14 = r3(atr);
    // G4 모멘텀
    f.ret1 = r3((c - pc) / pc * 100); f.ret5 = r3(ret(5)); f.ret20 = r3(ret(20)); f.ret60 = r3(ret(60));
    const mn = Math.min(...C), mx = Math.max(...C);
    f.pos200 = r3((c - mn) / ((mx - mn) || 1));                     // 200일 레인지 내 위치 0~1
    // G6 구조
    f.mktCap = m ? r3(c * num(m.sharesOutstanding) / 1e12) : null;  // 시총(조)
    f.lev = m ? num(m.leverageFactor) : null;
    f.last = c;
  }
  // G2' 미시구조 (스냅샷 — 누적 전제)
  if (ob && (ob.bids || ob.asks)) {
    const bid = (ob.bids || []).reduce((s, x) => s + num(x.volume), 0);
    const ask = (ob.asks || []).reduce((s, x) => s + num(x.volume), 0);
    f.obImbalance = r3((bid - ask) / ((bid + ask) || 1));           // 호가 불균형 -1~1
    const bb = num(ob.bids?.[0]?.price), ba = num(ob.asks?.[0]?.price);
    f.spread = bb && ba ? r3((ba - bb) / ((ba + bb) / 2) * 100) : null; // 스프레드%
    f.obDepth = r3((bid + ask) / 1e3);                             // 총 호가잔량(천주)
  }
  if (tr.length) {
    // 틱 룰: 직전 체결가 대비 상승=매수 추정
    let up = 0, dn = 0, pv = null;
    for (const x of tr) { const p = num(x.price), v = num(x.volume); if (pv != null) { if (p > pv) up += v; else if (p < pv) dn += v; } pv = p; }
    f.tradeStrength = r3((up - dn) / ((up + dn) || 1));            // 체결강도(매수-매도)/합 -1~1
    f.tradeN = tr.length;
  }
  out[u.code] = f;
  done++; if (done % 10 === 0 || done === universe.length) process.stdout.write(`\r수집 ${done}/${universe.length}`);
}
console.log("");

const result = { asOf: stocksData.asOf, source: "토스 일봉200+마스터+호가+체결", count: Object.keys(out).length, ohlcvDays: 200, features: out };
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/stock-features.json"), JSON.stringify(result));

const sample = out["005930"];
const featKeys = Object.keys(sample).filter((k) => !["code", "name", "theme"].includes(k));
console.log(`종목 ${result.count} · 피처 ${featKeys.length}개: ${featKeys.join(", ")}`);
console.log("삼성전자 예시:", JSON.stringify(Object.fromEntries(featKeys.slice(0, 12).map((k) => [k, sample[k]]))));
