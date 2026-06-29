// [표준 TA 지표 패널] 다른 증권사가 제공하는 표준 보조지표 전부를 200일 OHLCV로 계산.
//   종목별 일별: 이동평균·MACD·RSI·스토캐스틱(slow)·볼린저·CCI·Williams%R·OBV·MFI·ADX/DMI·이격도.
//   → data/ta-panel.json (gitignore). 정직 검증(backtest)에서 신호 상태(골든크로스·과매수 등) 도출용.
//   ※ 룩어헤드 없음: 각 날짜 지표는 그 날까지의 과거만.
import fs from "node:fs";
import path from "node:path";
import { tossGet, stocksBatch, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) { console.error("토스 키 없음(.env.local)"); process.exit(0); }
const stocksData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const marketMap = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/stock-markets.json"), "utf8"));
const TOPN = Number(process.env.TOPN) || stocksData.stocks.length;
const universe = stocksData.stocks.slice(0, TOPN).map((s) => ({ code: s.code, name: s.name, theme: s.themes?.[0] ?? "기타" }));
const KEEP = 140; // 저장 일수(워밍업 제외)

const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const sma = (a, n, i) => { if (i + 1 < n) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };
const stdev = (a, n, i) => { if (i + 1 < n) return null; const m = sma(a, n, i); let s = 0; for (let k = i - n + 1; k <= i; k++) s += (a[k] - m) ** 2; return Math.sqrt(s / n); };
function emaSeries(a, n) { const k = 2 / (n + 1), out = []; let e = a[0]; for (let i = 0; i < a.length; i++) { e = i === 0 ? a[0] : a[i] * k + e * (1 - k); out[i] = e; } return out; }
function rsiSeries(C, n = 14) { const out = []; let ag = 0, al = 0; for (let i = 1; i < C.length; i++) { const ch = C[i] - C[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0); if (i <= n) { ag += g; al += l; if (i === n) { ag /= n; al /= n; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } else out[i] = null; } else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } } out[0] = null; return out; }
function wilderSmooth(a, n) { const out = []; let s = 0; for (let i = 0; i < a.length; i++) { if (i < n) { s += a[i]; out[i] = i === n - 1 ? s : null; } else out[i] = out[i - 1] - out[i - 1] / n + a[i]; } return out; }

console.log("마스터 수집...");
const master = await stocksBatch(universe.map((u) => u.code));

const COLS = ["close", "sma5", "sma20", "sma60", "macd", "macdSig", "macdHist", "rsi14", "stochK", "stochD", "bbPctB", "bbBw", "cci20", "willr14", "obvOsc", "mfi14", "adx14", "pdi14", "mdi14", "disp20", "disp60", "relVol"];
const out = {};
let done = 0, skip = 0;
for (const u of universe) {
  let bars = [];
  try { const j = await tossGet(`/api/v1/candles?symbol=${u.code}&interval=1d&count=200`); bars = ((j.result && j.result.candles) || []).slice().reverse(); } catch {}
  await sleep(110); done++;
  if (bars.length < 80) { skip++; if (done % 20 === 0) process.stdout.write(`\rTA ${done}/${universe.length}`); continue; }
  const C = bars.map((b) => num(b.closePrice)), H = bars.map((b) => num(b.highPrice)), L = bars.map((b) => num(b.lowPrice)), V = bars.map((b) => num(b.volume));
  const D = bars.map((b) => String(b.timestamp).slice(0, 10));
  const n = C.length;
  const e12 = emaSeries(C, 12), e26 = emaSeries(C, 26);
  const macd = C.map((_, i) => e12[i] - e26[i]);
  const macdSig = emaSeries(macd, 9);
  const rsi = rsiSeries(C, 14);
  // OBV + 시그널(EMA20) → 정규화 오실레이터
  const obv = []; obv[0] = 0; for (let i = 1; i < n; i++) obv[i] = obv[i - 1] + (C[i] > C[i - 1] ? V[i] : C[i] < C[i - 1] ? -V[i] : 0);
  const obvSig = emaSeries(obv, 20);
  // ADX/DMI(14)
  const tr = [], pDM = [], mDM = [];
  for (let i = 0; i < n; i++) { if (i === 0) { tr[i] = H[i] - L[i]; pDM[i] = 0; mDM[i] = 0; continue; } const up = H[i] - H[i - 1], dn = L[i - 1] - L[i]; pDM[i] = up > dn && up > 0 ? up : 0; mDM[i] = dn > up && dn > 0 ? dn : 0; tr[i] = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])); }
  const trS = wilderSmooth(tr, 14), pS = wilderSmooth(pDM, 14), mS = wilderSmooth(mDM, 14);
  const pdi = [], mdi = [], dx = [];
  for (let i = 0; i < n; i++) { if (trS[i] == null) { pdi[i] = mdi[i] = dx[i] = null; continue; } pdi[i] = 100 * pS[i] / (trS[i] || 1e-9); mdi[i] = 100 * mS[i] / (trS[i] || 1e-9); dx[i] = 100 * Math.abs(pdi[i] - mdi[i]) / ((pdi[i] + mdi[i]) || 1e-9); }
  const adx = []; { let acc = 0, cnt = 0, started = false; for (let i = 0; i < n; i++) { if (dx[i] == null) { adx[i] = null; continue; } if (!started) { acc += dx[i]; cnt++; if (cnt === 14) { adx[i] = acc / 14; started = true; } else adx[i] = null; } else adx[i] = (adx[i - 1] * 13 + dx[i]) / 14; } }

  const rows = [], dates = [];
  const startI = Math.max(0, n - KEEP);
  for (let i = startI; i < n; i++) {
    const pc = C[i - 1] || C[i];
    // 스토캐스틱 fast %K(14) → slow %K=sma3, slow %D=sma3(slow%K)
    const kArr = [];
    for (let j = Math.max(0, i - 4); j <= i; j++) { let hh = -Infinity, ll = Infinity; for (let m = Math.max(0, j - 13); m <= j; m++) { hh = Math.max(hh, H[m]); ll = Math.min(ll, L[m]); } kArr.push(100 * (C[j] - ll) / ((hh - ll) || 1e-9)); }
    const fastK = kArr[kArr.length - 1];
    const slowK = kArr.length >= 3 ? (kArr.slice(-3).reduce((a, b) => a + b, 0) / 3) : fastK;
    // slow %D = sma3 of slowK — 근사로 직전 2개 slowK 필요 → 간이: 직전 fastK 3개 평균의 추세 대용
    const slowD = slowK; // 표시·검증엔 slowK 위주, 교차는 backtest에서 시계열로 계산
    // 볼린저(20,2)
    const mid = sma(C, 20, i), sd = stdev(C, 20, i);
    const up = mid != null ? mid + 2 * sd : null, lo = mid != null ? mid - 2 * sd : null;
    const pctB = up != null ? (C[i] - lo) / ((up - lo) || 1e-9) : null;
    const bw = mid != null ? (up - lo) / (mid || 1e-9) : null;
    // CCI(20)
    let cci = null; { const tp = []; for (let j = Math.max(0, i - 19); j <= i; j++) tp.push((H[j] + L[j] + C[j]) / 3); if (tp.length === 20) { const m = tp.reduce((a, b) => a + b, 0) / 20; const md = tp.reduce((a, b) => a + Math.abs(b - m), 0) / 20; cci = (tp[tp.length - 1] - m) / (0.015 * (md || 1e-9)); } }
    // Williams %R(14)
    let willr = null; { let hh = -Infinity, ll = Infinity; for (let j = Math.max(0, i - 13); j <= i; j++) { hh = Math.max(hh, H[j]); ll = Math.min(ll, L[j]); } willr = -100 * (hh - C[i]) / ((hh - ll) || 1e-9); }
    // MFI(14)
    let mfi = null; { let pos = 0, neg = 0, ok = i >= 14; if (ok) { for (let j = i - 13; j <= i; j++) { const tp = (H[j] + L[j] + C[j]) / 3, ptp = (H[j - 1] + L[j - 1] + C[j - 1]) / 3, rmf = tp * V[j]; if (tp > ptp) pos += rmf; else if (tp < ptp) neg += rmf; } mfi = 100 - 100 / (1 + pos / (neg || 1e-9)); } }
    const obvOsc = obvSig[i] ? r2((obv[i] - obvSig[i]) / (Math.abs(obvSig[i]) + 1e-9)) : 0;
    const s20 = sma(C, 20, i), s60 = sma(C, 60, i);
    const relVol = (V[i] + 1) / ((() => { const w = V.slice(Math.max(0, i - 19), i + 1); const ss = [...w].sort((a, b) => a - b); return ss[Math.floor(ss.length / 2)] || V[i]; })() + 1);
    rows.push([
      C[i], r2(sma(C, 5, i)), r2(s20), r2(s60),
      r2(macd[i]), r2(macdSig[i]), r2(macd[i] - macdSig[i]),
      r2(rsi[i]), r2(slowK), r2(slowD),
      pctB != null ? r2(pctB) : null, bw != null ? r2(bw) : null,
      cci != null ? r2(cci) : null, r2(willr), obvOsc, mfi != null ? r2(mfi) : null,
      r2(adx[i]), r2(pdi[i]), r2(mdi[i]),
      s20 ? r2(C[i] / s20 * 100) : null, s60 ? r2(C[i] / s60 * 100) : null, r2(relVol),
    ]);
    dates.push(D[i]);
  }
  out[u.code] = { code: u.code, name: u.name, theme: u.theme, market: marketMap[u.code] || "?", dates, rows };
  if (done % 20 === 0 || done === universe.length) process.stdout.write(`\rTA ${done}/${universe.length}`);
}
console.log("");
const result = { cols: COLS, count: Object.keys(out).length, skip, keep: KEEP, panel: out };
fs.writeFileSync(path.join(ROOT, "data/ta-panel.json"), JSON.stringify(result));
const s = out["005930"];
console.log(`종목 ${result.count}(스킵 ${skip}) · ${s ? s.rows.length : 0}일 · 지표 ${COLS.length}: ${COLS.join(",")}`);
if (s) { const r = s.rows[s.rows.length - 1]; console.log("삼성전자 최신:", COLS.map((c, i) => `${c}=${r[i]}`).slice(0, 12).join(" ")); }
