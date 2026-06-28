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

// 2) 직관적 단위: X=상대거래량(평소의 ×배), Y=등락률(%, 시가→종가). 각 날짜=실제 그날 값(EMA 없음).
//    좌표 매핑: x=log2(배수)/3 (1배=중앙, 8배=가장자리), y=등락%/8 (±8%=가장자리)
const VOL_EDGE = 3.2; // log2 배수: 2^3.2≈9배 → 가장자리
const RET_EDGE = 14;  // ±14% → 가장자리 (이 데이터는 일변동이 큼)
const DZ = 0.5;       // 정상권(이상점수 0) 반경 — 밖이면 색칠
const frames = [];
for (let f = 0; f < nFrames; f++) frames.push({ t: dateLabels[f] ?? "", b: [] });
per.forEach((p, i) => {
  const b = p.bars;
  const off = b.length - nFrames;
  for (let f = 0; f < nFrames; f++) {
    const idx = off + f;
    const day = b[idx];
    const trail = b.slice(Math.max(0, idx - BASE_WIN), idx).map((x) => Number(x.volume));
    const baseVol = median(trail) || Number(day.volume) || 1;
    const relVol = (Number(day.volume) + 1) / (baseVol + 1);          // 평소의 ×배
    const c = Number(day.closePrice);
    const prevC = Number(b[idx - 1]?.closePrice) || c;
    const retPct = prevC ? ((c - prevC) / prevC) * 100 : 0;           // 등락률(%, 전일 종가 대비)
    const x = clamp(Math.log2(relVol) / VOL_EDGE, -1, 1);
    const y = clamp(retPct / RET_EDGE, -1, 1);
    const r = Math.hypot(x, y);
    const anomaly = clamp((r - DZ) / (1.0 - DZ), 0, 1);                // 정상권 밖일수록↑
    frames[f].b[i] = [i, r3(x), r3(y), r2(anomaly), r2(relVol), r2(retPct)];
  }
});

const out = {
  asOf: lastDate,
  source: "토스인베스트 일봉 · 최근 거래일 robust-z 이상탐지(EMA 평활)",
  interval: "1d", window: `최근 ${nFrames}거래일 (${dateLabels[0]}~${dateLabels[nFrames - 1]})`, lastTs: lastDate,
  axes: { x: "상대거래량(평소의 ×배)", y: "등락률(%, 종가 기준)" },
  blip: "[i, x, y, anomaly, relVol(배), retPct(%)]",
  model: { volEdge: "8배=가장자리", retEdge: "±8%=가장자리", note: "각 날짜=실제 그날 스냅샷(EMA 없음), 직관 단위" },
  stocks, frameCount: nFrames, frames,
};
fs.writeFileSync(path.join(ROOT, "src/data/radar-frames.json"), JSON.stringify(out));
const last = frames[frames.length - 1].b.slice().sort((a, c) => c[3] - a[3]).slice(0, 5);
console.log(`종목 ${stocks.length} · 거래일 ${nFrames} (${dateLabels[0]}~${dateLabels[nFrames - 1]})`);
console.log("최신일 이상 TOP5:", last.map((x) => `${stocks[x[0]].name}(이상${x[3]}/거래량${x[4]}배/${x[5]}%)`).join(", "));
const counts = frames.map((f) => f.b.filter((x) => x[3] >= 0.45).length).sort((a, b) => a - b);
console.log(`프레임당 이상(≥0.45) — 최소 ${counts[0]} · 중앙 ${counts[Math.floor(counts.length / 2)]} · 최대 ${counts[counts.length - 1]}`);
