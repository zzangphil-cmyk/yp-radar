// 레이더 A(리플레이): 토스 1분봉(최대200) → 5분 프레임 × robust-z 좌표 + 이상점수
// 회의 결정: 두 축 모두 robust z(median·MAD) — X=거래량 이탈σ, Y=가격 이탈σ.
//   중심에서 거리 = 이상강도. dead-zone(±2σ) + 섹터(테마) 평균 차감으로 오탐 감소.
// 산출: src/data/radar-frames.json
import fs from "node:fs";
import path from "node:path";
import { tossGet, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) { console.error("토스 키 없음(.env.local) — 스킵"); process.exit(0); }

const TOPN = 50, BIN = 5;
const DEAD = 2;        // dead-zone: 집단 대비 2σ 이내 = 정상(이상점수 0)
const W_SPD = 0.1;     // 속도(궤적 변화) 가중
const SIG = 3;         // 집단 대비 3σ → 스코프 가장자리
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const mad = (a, m) => { const d = a.map((x) => Math.abs(x - m)); return median(d) * 1.4826 || 1e-9; }; // robust σ
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

const stocksData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const universe = stocksData.stocks.slice(0, TOPN).map((s) => ({ code: s.code, name: s.name, theme: s.themes?.[0] ?? "기타" }));

async function candles1m(symbol) {
  const j = await tossGet(`/api/v1/candles?symbol=${symbol}&interval=1m&count=200`);
  return (j.result && j.result.candles) || [];
}

// 1) 수집 → 5분 빈
const per = [];
let done = 0, asOf = stocksData.asOf, lastTs = "";
for (const u of universe) {
  let bars = [];
  try { bars = (await candles1m(u.code)).slice().reverse(); } catch { bars = []; }
  if (bars.length >= 25) {
    lastTs = bars[bars.length - 1].timestamp;
    const closes = bars.map((b) => Number(b.closePrice));
    const vols = bars.map((b) => Number(b.volume));
    const nBins = Math.floor(bars.length / BIN);
    const bins = [];
    for (let j = 0; j < nBins; j++) {
      let v = 0; for (let k = 0; k < BIN; k++) v += vols[j * BIN + k] || 0;
      bins.push({ vol: v, close: closes[j * BIN + BIN - 1], t: bars[j * BIN + BIN - 1].timestamp.slice(11, 16) });
    }
    per.push({ ...u, bins });
  }
  done++; if (done % 10 === 0 || done === universe.length) process.stdout.write(`\r수집 ${done}/${universe.length}`);
  await sleep(110);
}
console.log("");
const F = Math.min(...per.map((p) => p.bins.length));
if (!Number.isFinite(F) || F < 3) { console.error("데이터 부족"); process.exit(1); }

// 2) 종목별 1차 신호: vSig=log(RVOL, 자기평균 대비, de-size), pSig=수익률
const stocks = per.map((p) => ({ code: p.code, name: p.name, theme: p.theme }));
const themeOf = stocks.map((s) => s.theme);
const series = per.map((p) => {
  const bins = p.bins.slice(p.bins.length - F);
  const medVol = median(bins.map((b) => b.vol)) || 1;
  const rets = bins.map((b, j) => (j === 0 ? 0 : (b.close - bins[j - 1].close) / (bins[j - 1].close || 1)));
  const pts = bins.map((b, j) => ({
    vSig: Math.log((b.vol + 1) / (medVol + 1)), // 로그 상대거래량(자기평균 대비)
    pSig: rets[j],                               // 수익률(섹터차감은 프레임에서)
    mom: rets[j] * 100,
  }));
  return { pts };
});

// 3+4) 프레임별 "동종 집단(50종목) 대비" robust 표준화 → 좌표·이상점수
//   평범한 다수=중앙(±2σ 이내=정상), 집단에서 튄 소수만 가장자리. 시장 동반 이동은 자동 상쇄.
const tLabels = per[0].bins.slice(per[0].bins.length - F).map((b) => b.t);
const prevXY = stocks.map(() => ({ x: 0, y: 0 }));
const frames = [];
for (let j = 0; j < F; j++) {
  // 테마 평균 수익률 차감(시장/섹터 동반등락 제거)
  const byTheme = {};
  for (let i = 0; i < series.length; i++) (byTheme[themeOf[i]] ??= []).push(series[i].pts[j].pSig);
  const tMean = {}; for (const t in byTheme) tMean[t] = byTheme[t].reduce((a, b) => a + b, 0) / byTheme[t].length;
  const vArr = series.map((s) => s.pts[j].vSig);
  const pArr = series.map((s, i) => s.pts[j].pSig - tMean[themeOf[i]]);
  const mV = median(vArr), sV = mad(vArr, mV), mP = median(pArr), sP = mad(pArr, mP);
  const b = [];
  for (let i = 0; i < series.length; i++) {
    const zxF = (vArr[i] - mV) / sV;            // 거래량: 집단 대비 σ
    const zyF = (pArr[i] - mP) / sP;            // 가격: 집단·섹터 대비 σ
    const x = clamp(zxF / SIG, -1, 1), y = clamp(zyF / SIG, -1, 1);
    const r = Math.hypot(zxF, zyF);             // 중심에서의 거리(σ)
    const speed = Math.hypot(x - prevXY[i].x, y - prevXY[i].y);
    const anomaly = clamp((r - DEAD) / (5 - DEAD) + W_SPD * Math.min(speed / 0.5, 1), 0, 1); // dead-zone 2σ, 5σ→1
    prevXY[i] = { x, y };
    b.push([i, r3(x), r3(y), r2(anomaly), r2(zxF), r2(series[i].pts[j].mom)]);
  }
  frames.push({ t: tLabels[j] ?? "", b });
}

// 5) 시간축 EMA 평활 — 프레임별 집단 기준이 흔들려 좌표가 튀는 것을 잡아 부드럽게 글라이드
const ALPHA = 0.32;
const sm = stocks.map(() => null);
for (let f = 0; f < F; f++) {
  for (let i = 0; i < stocks.length; i++) {
    const b = frames[f].b[i]; // [i,x,y,anomaly,zVol,mom]
    if (sm[i] === null) sm[i] = { x: b[1], y: b[2], a: b[3] };
    else { sm[i].x += ALPHA * (b[1] - sm[i].x); sm[i].y += ALPHA * (b[2] - sm[i].y); sm[i].a += ALPHA * (b[3] - sm[i].a); }
    b[1] = r3(sm[i].x); b[2] = r3(sm[i].y); b[3] = r2(sm[i].a);
  }
}

const out = {
  asOf, source: "토스인베스트 1분봉(최근 ~200분) · robust-z 이상탐지(EMA 평활)",
  interval: "5m", window: `최근 ${F * BIN}분 리플레이`, lastTs,
  axes: { x: "거래량 이탈(집단 대비 σ)", y: "가격 이탈(집단·섹터 대비 σ)" },
  model: { deadZone: DEAD, speedWeight: W_SPD, sigmaEdge: SIG, note: "프레임별 50종목 집단 대비 robust-z" },
  stocks, frameCount: F, frames,
};
fs.writeFileSync(path.join(ROOT, "src/data/radar-frames.json"), JSON.stringify(out));
const last = frames[frames.length - 1].b.slice().sort((a, c) => c[3] - a[3]).slice(0, 5);
console.log(`종목 ${stocks.length} · 프레임 ${F} · 끝 ${lastTs}`);
console.log("최종프레임 이상 TOP5:", last.map((x) => `${stocks[x[0]].name}(이상${x[3]}/볼Z${x[4]}/${x[5]}%)`).join(", "));
const counts = frames.map((f) => f.b.filter((x) => x[3] >= 0.45).length).sort((a, b) => a - b);
const q = (p) => counts[Math.floor(counts.length * p)];
console.log(`프레임당 이상(≥0.45) 종목수 — 최소 ${counts[0]} · 중앙 ${q(0.5)} · 최대 ${counts[counts.length - 1]} (${stocks.length}중)`);
