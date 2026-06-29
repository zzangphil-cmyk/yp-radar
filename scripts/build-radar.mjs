// [온도계 레이더] 검증된 패널(data/stock-panel.json) → 단면 마할라노비스 D² 기반 이상강도(온도).
//   온도 = "지금 평소와 얼마나 다른가"(D², 변동성·이상 강도). 방향(수익률)은 표시만, 예측 아님.
//   D²는 441종목 단면에서 5개 검증 피처로 계산(Ledoit-Wolf 수축). 화면엔 상위 N개 표시.
//   피처: relVol(거래량 이탈) · 고유수익(시장·섹터 통제 ret) · vol20(변동성) · range(당일폭) · 자금유입(turnover⊥mktCap)
//   ※ 룩어헤드 없음: 각 날짜 피처는 그 날까지의 과거만(패널 단계에서 보장).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const panelData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stock-panel.json"), "utf8"));
const COLS = panelData.cols; // ["relVol","ret1","ret5","ret20","vol20","atr14","body","gap","range","turnover","close"]
const ci = (k) => COLS.indexOf(k);
const codes = Object.keys(panelData.panel);
const P = codes.map((c) => panelData.panel[c]);   // 전체 441 (D² 단면 모집단)
const N = P.length;

const TOPN = 50;       // 화면 표시 종목 수
const FRAMES = 30;     // 최근 거래일
const VOL_EDGE = 3.2, RET_DAILY = 14;
const DF = 5, CHI99 = 15.09; // df=5 카이제곱 99% → 온도 1.0 기준
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const madZ = (arr) => { const m = median(arr); const s = median(arr.map((x) => Math.abs(x - m))) * 1.4826 || 1e-9; return arr.map((x) => (x - m) / s); };

// 5×5 행렬 역행렬(가우스-조던)
function inv(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col; for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9; for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) if (r !== col) { const f = M[r][col]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j]; }
  }
  return M.map((r) => r.slice(n));
}

const dates = P[0].dates;
const totalDays = dates.length;
const start = Math.max(0, totalDays - FRAMES);
const themeAll = P.map((p) => p.theme ?? "기타");
const logMkt = P.map((p) => Math.log((p.mktCap || 0.01) + 1e-6)); // 시총 로그(고정)

const FEAT_LABELS = ["거래량", "고유수익", "변동성", "당일폭", "자금유입"];
const FEAT_GROUP = [0, 1, 2, 2, 3]; // 색조 그룹: 0거래량 1고유수익 2변동성 3자금유입 (당일폭→변동성과 합침)

// 종목별 표시용 결과 누적
const stocks = P.slice(0, TOPN).map((p) => ({ code: p.code, name: p.name, theme: p.theme }));
const frames = [];

for (let fi = 0; fi < FRAMES; fi++) {
  const d = start + fi;
  if (d >= totalDays) break;
  // 1) 원자료 단면
  const relVol = P.map((p) => p.rows[d]?.[ci("relVol")] ?? 1);
  const ret1 = P.map((p) => p.rows[d]?.[ci("ret1")] ?? 0);
  const vol20 = P.map((p) => p.rows[d]?.[ci("vol20")] ?? 0);
  const range = P.map((p) => p.rows[d]?.[ci("range")] ?? 0);
  const turnover = P.map((p) => p.rows[d]?.[ci("turnover")] ?? 0);
  // 2) 고유수익 = ret1 − 섹터평균 (시장·섹터 통제)
  const mkt = mean(ret1);
  const thS = {}, thN = {}; ret1.forEach((r, i) => { const t = themeAll[i]; thS[t] = (thS[t] || 0) + r; thN[t] = (thN[t] || 0) + 1; });
  const specRet = ret1.map((r, i) => r - (thS[themeAll[i]] / thN[themeAll[i]]));
  // 3) 자금유입 = log(turnover) ⊥ log(mktCap) 잔차 (단면 단순회귀)
  const lt = turnover.map((v) => Math.log((v || 0) + 1));
  const mx = mean(logMkt), my = mean(lt);
  let sxx = 0, sxy = 0; for (let i = 0; i < N; i++) { sxx += (logMkt[i] - mx) ** 2; sxy += (logMkt[i] - mx) * (lt[i] - my); }
  const beta = sxy / (sxx || 1e-9);
  const flow = lt.map((v, i) => v - (my + beta * (logMkt[i] - mx)));
  // 4) robust-z (단면)
  const Z = [madZ(relVol), madZ(specRet.map(Math.abs)), madZ(vol20), madZ(range), madZ(flow.map(Math.abs))];
  // 5) 상관행렬 + Ledoit-Wolf 수축 → 역행렬
  const p = 5;
  const C = Array.from({ length: p }, () => Array(p).fill(0));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { let s = 0; for (let i = 0; i < N; i++) s += Z[a][i] * Z[b][i]; C[a][b] = s / N; }
  // 수축강도(간이 LW): 비대각 평균제곱 대비. p/N 작으면 약하게.
  let offSq = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) if (a !== b) offSq += C[a][b] ** 2;
  const alpha = clamp(0.1 + (p / N), 0.1, 0.5);
  const S = C.map((row, a) => row.map((v, b) => (a === b ? v : (1 - alpha) * v)));
  const Si = inv(S);
  // 6) D² + 온도 + 최대기여
  const d2 = [], temp = [], topG = [];
  for (let i = 0; i < N; i++) {
    let q = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) q += Z[a][i] * Si[a][b] * Z[b][i];
    d2[i] = Math.max(0, q);
    temp[i] = clamp((d2[i] - DF) / (CHI99 - DF), 0, 1);
    let mg = -1, mgi = 0; for (let a = 0; a < p; a++) { const az = Math.abs(Z[a][i]); if (az > mg) { mg = az; mgi = a; } }
    topG[i] = FEAT_GROUP[mgi];
  }
  // 7) 표시 종목(상위 TOPN) blip: [i, x, y, temp, relVol, retPct, d2, topGroup]
  const b = [];
  for (let i = 0; i < TOPN; i++) {
    const x = clamp(Math.log2(Math.max(relVol[i], 1e-6)) / VOL_EDGE, -1, 1);
    const y = clamp(ret1[i] / RET_DAILY, -1, 1);
    b[i] = [i, r3(x), r3(y), r2(temp[i]), r2(relVol[i]), r2(ret1[i]), r2(d2[i]), topG[i]];
  }
  frames.push({ t: dates[d].slice(5).replace("-", "/"), b });
}

const lastDate = dates[Math.min(start + frames.length - 1, totalDays - 1)];
const out = {
  asOf: lastDate,
  source: "토스 일봉 패널 · 단면 마할라노비스 D²(Ledoit-Wolf) 이상강도(온도)",
  interval: "1d",
  window: `최근 ${frames.length}거래일 (${frames[0].t}~${frames[frames.length - 1].t})`,
  lastTs: lastDate,
  axes: { x: "상대거래량(평소의 ×배)", y: "등락률(%, 종가 기준)" },
  blip: "[i, x, y, temp(D²온도 0~1), relVol(배), retPct(%), d2, topGroup(0거래량/1고유수익/2변동성/3자금유입)]",
  model: { score: "Mahalanobis D² (5피처, Ledoit-Wolf 수축, 441종목 단면)", features: ["거래량", "고유수익", "변동성", "당일폭", "자금유입"], temp: `(D²−${DF})/(${CHI99}−${DF}) 클램프`, note: "온도=평소와 다른 정도(강도). 방향=수익률(표시용), 예측 아님" },
  featGroups: ["거래량", "고유수익", "변동성", "자금유입"],
  stocks, frameCount: frames.length, frames,
};
fs.writeFileSync(path.join(ROOT, "src/data/radar-frames.json"), JSON.stringify(out));

const last = frames[frames.length - 1].b.slice().sort((a, c) => c[3] - a[3]).slice(0, 6);
const GL = ["거래량", "고유수익", "변동성", "자금유입"];
console.log(`표시 ${stocks.length}종목(D²는 ${N}종목 단면) · 거래일 ${frames.length} (${frames[0].t}~${frames[frames.length - 1].t})`);
console.log("최신일 온도 TOP6:", last.map((x) => `${stocks[x[0]].name}(온도${x[3]}/D²${x[6]}/${GL[x[7]]}/${x[5]}%)`).join(", "));
const hotCnt = frames.map((f) => f.b.filter((x) => x[3] >= 0.45).length);
console.log(`프레임당 온도≥0.45 — 최소 ${Math.min(...hotCnt)} · 중앙 ${[...hotCnt].sort((a, b) => a - b)[Math.floor(hotCnt.length / 2)]} · 최대 ${Math.max(...hotCnt)}`);
