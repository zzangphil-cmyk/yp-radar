// [온도계 레이더] 검증 패널(data/stock-panel.json) → 단면 마할라노비스 D² 이상강도(온도).
//   universe = 코스피 200 + 코스닥 50 (노출 상위, src/data/stock-markets.json로 시장 구분).
//   온도 = "지금 평소와 얼마나 다른가"(D², 변동성·이상 강도). 방향(수익률)은 표시만, 예측 아님.
//   D²는 이 250종목 단면에서 5피처(거래량·고유수익·변동성·당일폭·자금유입), Ledoit-Wolf 수축.
//   ※ 시장 내(within-market) 표준화: 코스닥이 구조적으로 변동성이 커 글로벌 z면 코스닥만 늘 뜸 → 시장별로 z.
//   ※ 룩어헤드 없음: 각 날짜 피처는 그 날까지의 과거만(패널 단계에서 보장).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const panelData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stock-panel.json"), "utf8"));
const etfData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const marketMap = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/stock-markets.json"), "utf8"));
const COLS = panelData.cols;
const ci = (k) => COLS.indexOf(k);

const KOSPI_N = 200, KOSDAQ_N = 200; // 표시·D² universe (코스닥은 ETF구성종목 원천 한계까지)
const FRAMES = 30;
const VOL_EDGE = 3.2, RET_DAILY = 14;
const DF = 5, TEMP_CEIL = 100; // 온도 눈금: D²=DF→0°, D²=TEMP_CEIL→100° (로그 압축 — D² 두꺼운 꼬리를 펼쳐 상위 포화 방지)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
// 시장 내(within-group) robust-z: 그룹별 median/MAD로 표준화
function madZByGroup(arr, grp) {
  const groups = {};
  arr.forEach((v, i) => { (groups[grp[i]] ??= []).push(v); });
  const med = {}, sc = {};
  for (const g in groups) { const m = median(groups[g]); med[g] = m; sc[g] = (median(groups[g].map((x) => Math.abs(x - m))) * 1.4826) || 1e-9; }
  return arr.map((v, i) => (v - med[grp[i]]) / sc[grp[i]]);
}
// 시장 내 백분위(0~100, 높을수록 극단/이례) — "동종 대비 상위 X%"
function pctRankByGroup(arr, grp) {
  const groups = {};
  arr.forEach((v, i) => { (groups[grp[i]] ??= []).push(v); });
  const sorted = {}; for (const g in groups) sorted[g] = [...groups[g]].sort((a, b) => a - b);
  return arr.map((v, i) => { const s = sorted[grp[i]]; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; } return Math.round(lo / s.length * 100); });
}
// 5×5 역행렬(가우스-조던)
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

// universe 선택: etf-stocks 노출 순서로 코스피 200 + 코스닥 50 (패널 존재분)
const sel = [];
let nK = 0, nQ = 0;
for (const s of etfData.stocks) {
  const p = panelData.panel[s.code]; if (!p) continue;
  const mk = marketMap[s.code];
  if (mk === "KOSPI" && nK < KOSPI_N) { sel.push(p); nK++; }
  else if (mk === "KOSDAQ" && nQ < KOSDAQ_N) { sel.push(p); nQ++; }
  if (nK >= KOSPI_N && nQ >= KOSDAQ_N) break;
}
const N = sel.length;
const market = sel.map((p) => marketMap[p.code] || "KOSPI");
// 테마 우선순위: 구체 ETF 테마(반도체·2차전지…) > 네이버 업종명 > 버킷. 3종목 미만 테마는 "기타"로 합침.
const GENERIC = new Set(["코스피·대형", "코스닥", "배당·커버드콜", "기타"]);
const industry = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/stock-industry.json"), "utf8")).byCode; } catch { return {}; } })();
const ALIAS = { "반도체와반도체장비": "반도체" }; // 업종명이 기존 ETF 테마와 중복되면 합침
const themeByCode = {};
etfData.stocks.forEach((s) => {
  const specific = (s.themes || []).find((t) => !GENERIC.has(t));
  const t = specific || industry[s.code] || s.themes?.[0] || "기타";
  themeByCode[s.code] = ALIAS[t] || t;
});
const rawTheme = sel.map((p) => themeByCode[p.code] ?? p.theme ?? "기타");
const thCnt = {}; rawTheme.forEach((t) => { thCnt[t] = (thCnt[t] || 0) + 1; });
const MIN_THEME = 3;
const themeAll = rawTheme.map((t) => (thCnt[t] >= MIN_THEME ? t : "기타"));
const logMkt = sel.map((p) => Math.log((p.mktCap || 0.01) + 1e-6));

const FEAT_GROUP = [0, 1, 2, 2, 3]; // 0거래량 1고유수익 2변동성(당일폭 포함) 3자금유입

const dates = sel[0].dates;
const totalDays = dates.length;
const start = Math.max(0, totalDays - FRAMES);
const stocks = sel.map((p, i) => ({ code: p.code, name: p.name, theme: themeAll[i], market: marketMap[p.code] }));
const frames = [];

for (let fi = 0; fi < FRAMES; fi++) {
  const d = start + fi;
  if (d >= totalDays) break;
  const relVol = sel.map((p) => p.rows[d]?.[ci("relVol")] ?? 1);
  const ret1 = sel.map((p) => p.rows[d]?.[ci("ret1")] ?? 0);
  const vol20 = sel.map((p) => p.rows[d]?.[ci("vol20")] ?? 0);
  const range = sel.map((p) => p.rows[d]?.[ci("range")] ?? 0);
  const turnover = sel.map((p) => p.rows[d]?.[ci("turnover")] ?? 0);
  // 고유수익 = ret1 − 섹터평균
  const thS = {}, thN = {}; ret1.forEach((r, i) => { const t = themeAll[i]; thS[t] = (thS[t] || 0) + r; thN[t] = (thN[t] || 0) + 1; });
  const specRet = ret1.map((r, i) => r - (thS[themeAll[i]] / thN[themeAll[i]]));
  // 자금유입 = log(turnover) ⊥ log(mktCap) 잔차
  const lt = turnover.map((v) => Math.log((v || 0) + 1));
  const mx = mean(logMkt), my = mean(lt);
  let sxx = 0, sxy = 0; for (let i = 0; i < N; i++) { sxx += (logMkt[i] - mx) ** 2; sxy += (logMkt[i] - mx) * (lt[i] - my); }
  const beta = sxy / (sxx || 1e-9);
  const flow = lt.map((v, i) => v - (my + beta * (logMkt[i] - mx)));
  // 시장 내 robust-z
  const Z = [
    madZByGroup(relVol, market),
    madZByGroup(specRet.map(Math.abs), market),
    madZByGroup(vol20, market),
    madZByGroup(range, market),
    madZByGroup(flow.map(Math.abs), market),
  ];
  // 상관행렬 + Ledoit-Wolf 수축 → 역행렬
  const p = 5;
  const C = Array.from({ length: p }, () => Array(p).fill(0));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { let s = 0; for (let i = 0; i < N; i++) s += Z[a][i] * Z[b][i]; C[a][b] = s / N; }
  const alpha = clamp(0.1 + (p / N), 0.1, 0.5);
  const S = C.map((row, a) => row.map((v, b) => (a === b ? v : (1 - alpha) * v)));
  const Si = inv(S);
  // 5축 시장 내 백분위 — 카드 "무엇이 특이": [거래량,고유수익,변동성,당일폭,자금유입]
  const pcRel = pctRankByGroup(relVol, market), pcSpec = pctRankByGroup(specRet.map(Math.abs), market),
    pcVol = pctRankByGroup(vol20, market), pcRange = pctRankByGroup(range, market), pcFlow = pctRankByGroup(flow.map(Math.abs), market);
  // 축 원점 = 그날 횡단면 평균(중앙값): 점은 '평균 종목 대비' 상대 위치
  const Larr = relVol.map((v) => Math.log2(Math.max(v, 1e-6)));
  const Lmed = median(Larr), Rmed = median(ret1);
  // 3D 제3축용: 자금유입(부호 있는 z, 시장 내) — 09 백테스트에서 유일하게 생존한 신호
  const zFlow = madZByGroup(flow, market);
  // D² + 온도 + 최대기여 + 분해(시장/섹터/고유) + 5축 백분위 + 자금유입z
  const b = [];
  for (let i = 0; i < N; i++) {
    let q = 0; for (let a = 0; a < p; a++) for (let bb = 0; bb < p; bb++) q += Z[a][i] * Si[a][bb] * Z[bb][i];
    const d2 = Math.max(0, q);
    const temp = clamp(Math.log(Math.max(d2, DF) / DF) / Math.log(TEMP_CEIL / DF), 0, 1);
    let mg = -1, mgi = 0; for (let a = 0; a < p; a++) { const az = Math.abs(Z[a][i]); if (az > mg) { mg = az; mgi = a; } }
    const x = clamp((Larr[i] - Lmed) / VOL_EDGE, -1, 1);
    const y = clamp((ret1[i] - Rmed) / RET_DAILY, -1, 1);
    b[i] = [i, r3(x), r3(y), r2(temp), r2(relVol[i]), r2(ret1[i]), r2(d2), FEAT_GROUP[mgi],
      [pcRel[i], pcSpec[i], pcVol[i], pcRange[i], pcFlow[i]], r3(clamp(zFlow[i] / 3, -1, 1))];
  }
  frames.push({ t: dates[d].slice(5).replace("-", "/"), b });
}

const lastDate = dates[Math.min(start + frames.length - 1, totalDays - 1)];
const out = {
  asOf: lastDate,
  source: "토스 일봉 패널 · 단면 마할라노비스 D²(Ledoit-Wolf, 시장 내 표준화) 이상강도(온도)",
  interval: "1d",
  window: `최근 ${frames.length}거래일 (${frames[0].t}~${frames[frames.length - 1].t})`,
  lastTs: lastDate,
  universe: `코스피 ${nK} · 코스닥 ${nQ}`,
  axes: { x: "상대거래량(평소의 ×배)", y: "등락률(%, 종가 기준)" },
  blip: "[i, x, y, temp(D²온도 0~1), relVol(배), retPct(%), d2, topGroup(0거래량/1고유수익/2변동성/3자금유입), pct5(시장내 백분위), zFlow(자금유입 z ÷3 클램프, 3D Z축)]",
  model: { score: "Mahalanobis D² (5피처, Ledoit-Wolf 수축, 시장 내 표준화)", features: ["거래량", "고유수익", "변동성", "당일폭", "자금유입"], temp: `log(D²/${DF})/log(${TEMP_CEIL}/${DF}) 클램프 (로그 압축)`, note: "온도=평소와 다른 정도(강도). 방향=수익률(표시용), 예측 아님" },
  featGroups: ["거래량", "고유수익", "변동성", "자금유입"],
  stocks, frameCount: frames.length, frames,
};
fs.writeFileSync(path.join(ROOT, "src/data/radar-frames.json"), JSON.stringify(out));

const last = frames[frames.length - 1].b.slice().sort((a, c) => c[3] - a[3]).slice(0, 6);
const GL = ["거래량", "고유수익", "변동성", "자금유입"];
console.log(`universe 코스피 ${nK} + 코스닥 ${nQ} = ${N}종목 · 거래일 ${frames.length} (${frames[0].t}~${frames[frames.length - 1].t})`);
console.log("최신일 온도 TOP6:", last.map((x) => `${stocks[x[0]].name}[${stocks[x[0]].market === "KOSDAQ" ? "Q" : "K"}](온도${x[3]}/D²${x[6]}/${GL[x[7]]}/${x[5]}%)`).join(", "));
const hotCnt = frames.map((f) => f.b.filter((x) => x[3] >= 0.45).length);
console.log(`프레임당 온도≥0.45 — 최소 ${Math.min(...hotCnt)} · 중앙 ${[...hotCnt].sort((a, b) => a - b)[Math.floor(hotCnt.length / 2)]} · 최대 ${Math.max(...hotCnt)}`);
