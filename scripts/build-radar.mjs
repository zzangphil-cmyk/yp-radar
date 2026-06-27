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

// 2) 종목별 robust-z (자기 평소 대비) — 색·위치가 같은 기준이 되도록 섹터차감/집단표준화 제거
//    X=거래량 이탈(자기 거래량 분포 대비), Y=일중수익률 이탈(자기 수익률 분포 대비). Y부호=실제 방향.
const series = per.map((p) => {
  const b = p.bars;
  const off = b.length - nFrames;
  const logV = b.map((x) => Math.log(Number(x.volume) + 1));
  const rets = b.map((x) => { const o = Number(x.openPrice), c = Number(x.closePrice); return o ? (c - o) / o : 0; });
  const mLV = median(logV), sLV = mad(logV, mLV);
  const sR = mad(rets, median(rets)); // 척도만(중앙값 차감 X) → y부호=실제 등락방향
  const pts = [];
  for (let f = 0; f < nFrames; f++) {
    const idx = off + f;
    pts.push({ zVol: (logV[idx] - mLV) / sLV, zRet: rets[idx] / sR, mom: rets[idx] * 100 });
  }
  return { pts };
});

// 3) 좌표·이상점수 (자기 대비 σ → 중심=정상, 거리=이상). 색은 컴포넌트에서 y부호로.
const prevXY = stocks.map(() => ({ x: 0, y: 0 }));
const frames = [];
for (let f = 0; f < nFrames; f++) {
  const b = [];
  for (let i = 0; i < series.length; i++) {
    const p = series[i].pts[f];
    const x = clamp(p.zVol / SIG, -1, 1), y = clamp(p.zRet / SIG, -1, 1);
    const r = Math.hypot(p.zVol, p.zRet);
    const speed = Math.hypot(x - prevXY[i].x, y - prevXY[i].y);
    const anomaly = clamp((r - DEAD) / (5 - DEAD) + W_SPD * Math.min(speed / 0.5, 1), 0, 1);
    prevXY[i] = { x, y };
    b.push([i, r3(x), r3(y), r2(anomaly), r2(p.zVol), r2(p.mom)]);
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
  axes: { x: "거래량 이탈(자기 평소 대비 σ)", y: "일중수익률 이탈(시가→종가, 자기 평소 대비 σ)" },
  model: { deadZone: DEAD, sigmaEdge: SIG, ema: ALPHA, note: "종목별 자기 분포 대비 robust-z (색·위치 동일 기준)" },
  stocks, frameCount: nFrames, frames,
};
fs.writeFileSync(path.join(ROOT, "src/data/radar-frames.json"), JSON.stringify(out));
const last = frames[frames.length - 1].b.slice().sort((a, c) => c[3] - a[3]).slice(0, 5);
console.log(`종목 ${stocks.length} · 거래일 ${nFrames} (${dateLabels[0]}~${dateLabels[nFrames - 1]})`);
console.log("최신일 이상 TOP5:", last.map((x) => `${stocks[x[0]].name}(이상${x[3]}/볼Z${x[4]}/${x[5]}%)`).join(", "));
const counts = frames.map((f) => f.b.filter((x) => x[3] >= 0.45).length).sort((a, b) => a - b);
console.log(`프레임당 이상(≥0.45) — 최소 ${counts[0]} · 중앙 ${counts[Math.floor(counts.length / 2)]} · 최대 ${counts[counts.length - 1]}`);
