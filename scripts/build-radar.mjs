// 레이더(날짜 흐름): 토스 일봉(1d) → 최근 N거래일 프레임 × robust-z 좌표 + 이상점수
// 각 프레임 = 거래일. X=거래량 이탈(집단 대비), Y=일중수익률(시가→종가) 이탈. EMA 평활.
// 토스는 과거 분봉을 안 줘서(최근 200분만) 분단위 과거 세션은 불가 → 일봉으로 '날짜 흐름' 구성.
// 산출: src/data/radar-frames.json
import fs from "node:fs";
import path from "node:path";
import { tossGet, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) { console.error("토스 키 없음(.env.local) — 스킵"); process.exit(0); }

const TOPN = 50;
const FRAMES = 30;     // 보여줄 최근 거래일 수
const BASE_WIN = 20;   // 거래량 베이스라인(직전 N거래일 중앙값)
const FETCH = FRAMES + BASE_WIN + 5; // 일봉 요청 개수
const DEAD = 2, W_SPD = 0.1, SIG = 3, ALPHA = 0.35;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const mad = (a, m) => median(a.map((x) => Math.abs(x - m))) * 1.4826 || 1e-9;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

const stocksData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const universe = stocksData.stocks.slice(0, TOPN).map((s) => ({ code: s.code, name: s.name, theme: s.themes?.[0] ?? "기타" }));

async function daily(symbol) {
  const j = await tossGet(`/api/v1/candles?symbol=${symbol}&interval=1d&count=${FETCH}`);
  return (j.result && j.result.candles) || []; // 최신→과거
}

// 1) 일봉 수집
const per = [];
let done = 0;
for (const u of universe) {
  let bars = [];
  try { bars = (await daily(u.code)).slice().reverse(); } catch { bars = []; } // 과거→최신
  if (bars.length >= FRAMES + 3) per.push({ ...u, bars });
  done++; if (done % 10 === 0 || done === universe.length) process.stdout.write(`\r수집 ${done}/${universe.length}`);
  await sleep(110);
}
console.log("");
const L = Math.min(...per.map((p) => p.bars.length));
const nFrames = Math.min(FRAMES, L - 3);
const startIdx = L - nFrames; // 각 종목 bars의 마지막 nFrames개를 프레임으로(인덱스 정렬)

const stocks = per.map((p) => ({ code: p.code, name: p.name, theme: p.theme }));
const themeOf = stocks.map((s) => s.theme);
const dateLabels = per[0].bars.slice(per[0].bars.length - nFrames).map((b) => b.timestamp.slice(5, 10).replace("-", "/"));
const lastDate = per[0].bars[per[0].bars.length - 1].timestamp.slice(0, 10);

// 2) 종목별 1차 신호: vSig=log(RVOL, 직전20일 중앙값 대비), pSig=일중수익률(시가→종가)
const series = per.map((p) => {
  const b = p.bars;
  const off = b.length - nFrames;
  const pts = [];
  for (let f = 0; f < nFrames; f++) {
    const idx = off + f;
    const day = b[idx];
    const trail = b.slice(Math.max(0, idx - BASE_WIN), idx).map((x) => Number(x.volume));
    const baseVol = median(trail) || Number(day.volume) || 1;
    const open = Number(day.openPrice), close = Number(day.closePrice);
    pts.push({
      vSig: Math.log((Number(day.volume) + 1) / (baseVol + 1)),
      pSig: open ? (close - open) / open : 0, // 일중수익률(시가→종가)
      mom: open ? ((close - open) / open) * 100 : 0,
    });
  }
  return { pts };
});

// 3) 프레임(거래일)별 집단 대비 robust-z → 좌표·이상점수
const prevXY = stocks.map(() => ({ x: 0, y: 0 }));
const frames = [];
for (let f = 0; f < nFrames; f++) {
  const byTheme = {};
  for (let i = 0; i < series.length; i++) (byTheme[themeOf[i]] ??= []).push(series[i].pts[f].pSig);
  const tMean = {}; for (const t in byTheme) tMean[t] = byTheme[t].reduce((a, b) => a + b, 0) / byTheme[t].length;
  const vArr = series.map((s) => s.pts[f].vSig);
  const pArr = series.map((s, i) => s.pts[f].pSig - tMean[themeOf[i]]);
  const mV = median(vArr), sV = mad(vArr, mV), mP = median(pArr), sP = mad(pArr, mP);
  const b = [];
  for (let i = 0; i < series.length; i++) {
    const zxF = (vArr[i] - mV) / sV, zyF = (pArr[i] - mP) / sP;
    const x = clamp(zxF / SIG, -1, 1), y = clamp(zyF / SIG, -1, 1);
    const r = Math.hypot(zxF, zyF);
    const speed = Math.hypot(x - prevXY[i].x, y - prevXY[i].y);
    const anomaly = clamp((r - DEAD) / (5 - DEAD) + W_SPD * Math.min(speed / 0.5, 1), 0, 1);
    prevXY[i] = { x, y };
    b.push([i, r3(x), r3(y), r2(anomaly), r2(zxF), r2(series[i].pts[f].mom)]);
  }
  frames.push({ t: dateLabels[f] ?? "", b });
}

// 4) 시간축 EMA 평활 — 부드러운 글라이드
const sm = stocks.map(() => null);
for (let f = 0; f < nFrames; f++) {
  for (let i = 0; i < stocks.length; i++) {
    const b = frames[f].b[i];
    if (sm[i] === null) sm[i] = { x: b[1], y: b[2], a: b[3] };
    else { sm[i].x += ALPHA * (b[1] - sm[i].x); sm[i].y += ALPHA * (b[2] - sm[i].y); sm[i].a += ALPHA * (b[3] - sm[i].a); }
    b[1] = r3(sm[i].x); b[2] = r3(sm[i].y); b[3] = r2(sm[i].a);
  }
}

const out = {
  asOf: lastDate,
  source: "토스인베스트 일봉 · 최근 거래일 robust-z 이상탐지(EMA 평활)",
  interval: "1d", window: `최근 ${nFrames}거래일 (${dateLabels[0]}~${dateLabels[nFrames - 1]})`, lastTs: lastDate,
  axes: { x: "거래량 이탈(집단 대비 σ)", y: "일중수익률 이탈(시가→종가, 집단·섹터 대비 σ)" },
  model: { deadZone: DEAD, sigmaEdge: SIG, ema: ALPHA, note: "거래일별 50종목 집단 대비 robust-z" },
  stocks, frameCount: nFrames, frames,
};
fs.writeFileSync(path.join(ROOT, "src/data/radar-frames.json"), JSON.stringify(out));
const last = frames[frames.length - 1].b.slice().sort((a, c) => c[3] - a[3]).slice(0, 5);
console.log(`종목 ${stocks.length} · 거래일 ${nFrames} (${dateLabels[0]}~${dateLabels[nFrames - 1]})`);
console.log("최신일 이상 TOP5:", last.map((x) => `${stocks[x[0]].name}(이상${x[3]}/볼Z${x[4]}/${x[5]}%)`).join(", "));
const counts = frames.map((f) => f.b.filter((x) => x[3] >= 0.45).length).sort((a, b) => a - b);
console.log(`프레임당 이상(≥0.45) — 최소 ${counts[0]} · 중앙 ${counts[Math.floor(counts.length / 2)]} · 최대 ${counts[counts.length - 1]}`);
