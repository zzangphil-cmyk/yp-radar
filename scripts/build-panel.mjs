// [과거 검증용 — 일별 패널 재구성] 200일 일봉을 종목×날짜 피처 패널로.
//  각 날짜 t의 피처는 t 시점까지의 과거 봉만 사용(룩어헤드 차단). 미시구조(호가·체결) 제외 — 스냅샷이라 역사 없음.
//  → data/stock-panel.json (gitignore). 검증 스크립트(backtest)가 forward return을 close로 별도 계산.
import fs from "node:fs";
import path from "node:path";
import { tossGet, stocksBatch, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) { console.error("토스 키 없음(.env.local)"); process.exit(0); }

const stocksData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const TOPN = Number(process.env.TOPN) || stocksData.stocks.length;
const universe = stocksData.stocks.slice(0, TOPN).map((s) => ({ code: s.code, name: s.name, theme: s.themes?.[0] ?? "기타" }));

const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);

const LOOKBACK = 60; // 패널 시작 전 확보할 과거일(vol/ret 안정)

async function candles1d(code) { const j = await tossGet(`/api/v1/candles?symbol=${code}&interval=1d&count=200`); return (j.result && j.result.candles) || []; }

console.log("마스터 수집...");
const master = await stocksBatch(universe.map((u) => u.code));

// 피처 키(컬럼) 순서 — rows의 각 행이 이 순서
const COLS = ["relVol", "ret1", "ret5", "ret20", "vol20", "atr14", "body", "gap", "range", "turnover", "close"];

const out = {};
let done = 0, skipped = 0;
for (const u of universe) {
  let bars = [];
  try { bars = (await candles1d(u.code)).slice().reverse(); } catch {} // 과거→최신
  await sleep(110);
  done++;
  if (bars.length < LOOKBACK + 20) { skipped++; if (done % 20 === 0) process.stdout.write(`\r패널 ${done}/${universe.length}`); continue; }

  const C = bars.map((b) => num(b.closePrice)), O = bars.map((b) => num(b.openPrice));
  const H = bars.map((b) => num(b.highPrice)), L = bars.map((b) => num(b.lowPrice)), V = bars.map((b) => num(b.volume));
  const D = bars.map((b) => String(b.timestamp).slice(0, 10));
  const n = C.length;
  const rets = C.map((v, i) => (i === 0 ? 0 : (v - C[i - 1]) / (C[i - 1] || 1)));

  const rows = [], dates = [];
  for (let t = LOOKBACK; t < n; t++) {
    const pc = C[t - 1] || C[t];
    const relVol = (V[t] + 1) / (median(V.slice(t - 19, t + 1)) + 1);
    const vol20 = std(rets.slice(t - 19, t + 1)) * 100;
    const atr14 = mean(bars.slice(t - 13, t + 1).map((b) => (num(b.highPrice) - num(b.lowPrice)))) / (pc || 1) * 100;
    const ret = (k) => (C[t] - C[t - k]) / (C[t - k] || 1) * 100;
    rows.push([
      r4(relVol),                                   // relVol
      r4((C[t] - pc) / pc * 100),                   // ret1 %
      r4(ret(5)), r4(ret(20)),                      // ret5, ret20 %
      r4(vol20), r4(atr14),                         // vol20, atr14
      r4((C[t] - O[t]) / ((H[t] - L[t]) || 1)),     // body
      r4((O[t] - pc) / pc * 100),                   // gap %
      r4((H[t] - L[t]) / pc * 100),                 // range %
      r4(C[t] * V[t] / 1e8),                        // turnover(억)
      C[t],                                          // close (forward return 계산용)
    ]);
    dates.push(D[t]);
  }
  const m = master[u.code];
  out[u.code] = {
    code: u.code, name: u.name, theme: u.theme,
    mktCap: m ? r4(C[n - 1] * num(m.sharesOutstanding) / 1e12) : null, // 시총(조)
    dates, rows,
  };
  if (done % 20 === 0 || done === universe.length) process.stdout.write(`\r패널 ${done}/${universe.length}`);
}
console.log("");

const result = { asOf: stocksData.asOf, cols: COLS, lookback: LOOKBACK, count: Object.keys(out).length, skipped, panel: out };
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/stock-panel.json"), JSON.stringify(result));
const sample = out["005930"];
console.log(`종목 ${result.count}개(스킵 ${skipped}) · 종목당 ${sample ? sample.rows.length : 0}일 · 컬럼 ${COLS.length}: ${COLS.join(",")}`);
console.log(`기간 예시(삼성전자): ${sample ? sample.dates[0] : "-"} ~ ${sample ? sample.dates[sample.dates.length - 1] : "-"}`);
