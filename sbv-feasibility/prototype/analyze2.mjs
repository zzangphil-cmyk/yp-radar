/**
 * analyze2.mjs — 심층 분석: 버린 작은 신호 다시 보기
 *
 * 과제:
 *  1. 중복쌍 직교 잔차 — 중복이라 버린 부분이 독립 이상정보를 갖는가?
 *  2. 조건부(strata) — 시총·시장별로 약한 피처의 분포·이상관련성이 다른가?
 *  3. 미세 다중 vs 단일 극단 — |z|<2인데 D² 상위인 종목 목록, 단일 극단과 분리
 *  4. 구분 — 구조적 real vs 가설 라벨
 *
 * 데이터: data/stock-features.json (441종목 단면)
 */

import fs from 'fs';

// ────────────────────────────────────────────
// 0. 데이터 로드
// ────────────────────────────────────────────
const DATA_PATH = 'C:/Users/zzang/Desktop/Yoon_temp/stock/data/stock-features.json';
const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const all = Object.values(raw.features);   // 441개
const N = all.length;
console.log(`\n총 종목 수: ${N}\n`);

// ────────────────────────────────────────────
// 유틸 함수
// ────────────────────────────────────────────

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr, mu) {
  if (mu === undefined) mu = mean(arr);
  const v = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  const sa = std(a, ma), sb = std(b, mb);
  if (sa < 1e-12 || sb < 1e-12) return 0;
  const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (a.length - 1);
  return cov / (sa * sb);
}

function isFinite_(v) { return typeof v === 'number' && isFinite(v); }

/** OLS 단순 선형회귀: y = a + b*x, 잔차 반환 */
function olsSimple(x, y) {
  // y_i = a + b * x_i + e_i
  const n = x.length;
  const mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const b = sxx < 1e-12 ? 0 : sxy / sxx;  // 기울기
  const a = my - b * mx;                   // 절편
  const resid = y.map((yi, i) => yi - (a + b * x[i]));
  const yhat = x.map(xi => a + b * xi);
  const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const ssRes = resid.reduce((s, v) => s + v * v, 0);
  const R2 = ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
  return { resid, R2, b, a, yhat };
}

/** 분포 기술통계 */
function desc(arr) {
  const mu = mean(arr);
  const s = std(arr, mu);
  const sorted = [...arr].sort((a, b) => a - b);
  const p = q => sorted[Math.max(0, Math.floor(q * sorted.length))];
  const kurt = arr.reduce((s, v) => s + ((v - mu) / s) ** 4, 0) / arr.length;  // 근사 첨도
  return {
    n: arr.length,
    mean: mu,
    std: s,
    min: sorted[0],
    p5: p(0.05), p25: p(0.25), median: p(0.50), p75: p(0.75), p95: p(0.95),
    max: sorted[sorted.length - 1]
  };
}

function fmt(v, d=3) { return typeof v === 'number' ? v.toFixed(d) : String(v); }

/** 마할라노비스 D²(z, Σ^{-1}) */
function mahalD2(z, Sinv) {
  let d2 = 0;
  for (let i = 0; i < z.length; i++)
    for (let j = 0; j < z.length; j++)
      d2 += z[i] * Sinv[i][j] * z[j];
  return d2;
}

/** Gauss-Jordan 역행렬 */
function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array.from({length: n}, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    aug[col] = aug[col].map(v => v / pivot);
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      aug[r] = aug[r].map((v, c) => v - f * aug[col][c]);
    }
  }
  return aug.map(row => row.slice(n));
}

/** 표본 공분산행렬 */
function covMatrix(Z) {
  const n = Z.length, p = Z[0].length;
  return Array.from({length: p}, (_, i) =>
    Array.from({length: p}, (_, j) =>
      Z.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)
    )
  );
}

/** Ledoit-Wolf 수축 공분산 */
function ledoitWolfCov(Z) {
  const n = Z.length, p = Z[0].length;
  const S = covMatrix(Z);
  const trS = S.reduce((s, _, i) => s + S[i][i], 0);
  const S2F = S.reduce((s, row) => s + row.reduce((t, v) => t + v * v, 0), 0);
  const mu = trS / p;
  const num = ((n - 2) / n) * S2F + trS * trS;
  const den = (n + 2) * (S2F - trS * trS / p);
  const rho = den < 1e-12 ? 0 : Math.min(1, num / den);
  const Slw = S.map((row, i) => row.map((v, j) => (1 - rho) * v + (i === j ? rho * mu : 0)));
  return { Slw, rho };
}

/** z-score 표준화 */
function zscoreMatrix(mat) {
  const p = mat[0].length;
  const means = Array.from({length: p}, (_, j) => mean(mat.map(r => r[j])));
  const stds  = Array.from({length: p}, (_, j) => std(mat.map(r => r[j]), means[j]));
  const Z = mat.map(row => row.map((v, j) => stds[j] < 1e-12 ? 0 : (v - means[j]) / stds[j]));
  return { Z, means, stds };
}

// ────────────────────────────────────────────
// 공통: 유효 행 (mktCap, obImbalance, spread, tradeStrength 등 모두 있는 종목)
// ────────────────────────────────────────────
const ALL_FEATS = [
  'gap', 'range', 'body', 'relVol', 'turnover', 'vol20', 'volRatio',
  'atr14', 'ret1', 'ret5', 'ret20', 'ret60',
  'pos200', 'mktCap', 'obImbalance', 'spread', 'tradeStrength'
];

const stocks = all.filter(s => ALL_FEATS.every(f => isFinite_(s[f])));
const M = stocks.length;
console.log(`유효 종목 (모든 피처 존재): ${M}\n`);

// 테마 목록 (섹터 회귀용)
const themes = [...new Set(stocks.map(s => s.theme))].sort();

/**
 * 테마 더미 OLS 잔차 (시장·섹터 통제)
 * y ~ intercept + 테마더미 → 잔차 반환
 */
function themeResid(y) {
  const dummies = themes.slice(1);
  const X = stocks.map(s => [1, ...dummies.map(d => s.theme === d ? 1 : 0)]);
  const p = X[0].length;
  const XtX = Array.from({length: p}, (_, i) =>
    Array.from({length: p}, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0))
  );
  const Xty = Array.from({length: p}, (_, i) => X.reduce((s, r, m) => s + r[i] * y[m], 0));
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let mx = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[mx][col])) mx = r;
    [aug[col], aug[mx]] = [aug[mx], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-12) continue;
    aug[col] = aug[col].map(v => v / piv);
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      aug[r] = aug[r].map((v, c) => v - f * aug[col][c]);
    }
  }
  const beta = aug.map(r => r[p]);
  const yhat = X.map(r => r.reduce((s, v, i) => s + v * beta[i], 0));
  const resid = y.map((v, i) => v - yhat[i]);
  const mu = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - mu) ** 2, 0);
  const ssRes = resid.reduce((s, v) => s + v * v, 0);
  const R2 = ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
  return { resid, R2 };
}

// 미리 계산: ret1 테마 잔차 (D² 기저로 재사용)
const ret1Val = stocks.map(s => s.ret1);
const { resid: ret1Resid, R2: ret1R2 } = themeResid(ret1Val);

// ════════════════════════════════════════════════════════════════════
// 1. 중복쌍 직교 잔차 — 독립 이상정보 추출
// ════════════════════════════════════════════════════════════════════
console.log('════════════════════════════════════════════════════════════════════');
console.log('1. 중복쌍 직교 잔차 — 버린 부분에 독립 이상정보가 있나?');
console.log('════════════════════════════════════════════════════════════════════');

/**
 * 쌍 (X→Y): Y를 X로 단순 OLS 회귀 → 잔차 = "X로 설명되지 않는 Y"
 * 이 잔차가 중복쌍에서 버려지는 부분.
 * 검증: 잔차 vs D² 상관, 잔차 분산, 극단 종목 예시
 */

// (A) vol20 → atr14  (ρ=0.82): atr14 − f(vol20) = "거래량으로 설명 안 되는 일중 변동성"
const vol20Vals = stocks.map(s => s.vol20);
const atr14Vals = stocks.map(s => s.atr14);
const { resid: res_atr_vol, R2: R2_atr_vol } = olsSimple(vol20Vals, atr14Vals);
// 음: 잔차 = ATR 중 vol20이 못 설명하는 부분 (= 가격 이동 효율성/스파이크 성분)

// (B) ret5 → ret20  (ρ=0.77): ret20 − f(ret5) = "단기 추세를 넘어선 중기 성과"
const ret5Vals  = stocks.map(s => s.ret5);
const ret20Vals = stocks.map(s => s.ret20);
const { resid: res_ret20_ret5, R2: R2_ret20_ret5 } = olsSimple(ret5Vals, ret20Vals);
// 해석: 양수 = 최근 5일보다 20일 기준으로 더 잘 나간 종목 = 지속상승

// (C) ret5 → ret60  사슬 전체 이해를 위해 추가
const ret60Vals = stocks.map(s => s.ret60);
const { resid: res_ret60_ret5, R2: R2_ret60_ret5 } = olsSimple(ret5Vals, ret60Vals);
// 해석: 양수 = 장기 상승이 단기 반등 이상으로 축적된 종목 (진짜 모멘텀 지속)

// (D) body → ret1  (body = 봉 몸통, ret1 = 전일 대비): body − f(ret1) = "수익률로 설명 안 되는 봉 몸통"
const bodyVals = stocks.map(s => s.body);
const { resid: res_body_ret1, R2: R2_body_ret1 } = olsSimple(ret1Val, bodyVals);
// 해석: body > 예측치 → 봉이 꽉 찬 음양봉(위아래 수염 없이 강한 방향성)

// (E) mktCap → turnover  (ρ=0.98): turnover − f(mktCap) = "시총으로 설명 안 되는 초과 거래대금"
const mktCapVals  = stocks.map(s => s.mktCap);
const turnoverVals = stocks.map(s => s.turnover);
const { resid: res_to_cap, R2: R2_to_cap } = olsSimple(mktCapVals, turnoverVals);
// 해석: 시총 대비 거래대금 초과 = 자금 유입 신호 (turnover z-score와 유사하지만 mktCap 통제 후)

// 분산 요약
const residPairs = [
  { label: 'atr14 ⊥ vol20', resid: res_atr_vol,      R2: R2_atr_vol,      desc2: '가격이동의 거래량-외 성분 (스파이크/노이즈 vs 기관 슬리피지)' },
  { label: 'ret20 ⊥ ret5',  resid: res_ret20_ret5,   R2: R2_ret20_ret5,   desc2: '중기 vs 단기 초과수익 = 모멘텀 지속성 (양: 상승 지속, 음: 조정)' },
  { label: 'ret60 ⊥ ret5',  resid: res_ret60_ret5,   R2: R2_ret60_ret5,   desc2: '장기 vs 단기 초과수익 = 추세 축적 (단기 바닥반등 vs 진짜 추세)' },
  { label: 'body ⊥ ret1',   resid: res_body_ret1,    R2: R2_body_ret1,    desc2: '봉 몸통이 수익률보다 큰 정도 = 방향성 강도 (수염 vs 알맹이)' },
  { label: 'turnover ⊥ cap',resid: res_to_cap,       R2: R2_to_cap,       desc2: '시총 통제 후 초과 거래대금 = 순수 자금유입 신호' },
];

console.log('\n  [잔차 분산 요약]');
console.log('  ' + '─'.repeat(80));
residPairs.forEach(p => {
  const d = desc(p.resid);
  const s = std(p.resid, d.mean);
  // z-score 변환해서 |z|>2 종목 수 세기
  const zArr = p.resid.map(v => (v - d.mean) / (s < 1e-12 ? 1 : s));
  const n2 = zArr.filter(v => Math.abs(v) > 2).length;
  const n3 = zArr.filter(v => Math.abs(v) > 3).length;
  console.log(`  ${p.label.padEnd(18)} R²=${fmt(p.R2,3)}  잔차σ=${fmt(s,3)}  |z|>2: ${n2}종목 (${fmt(n2/M*100,1)}%)  |z|>3: ${n3}종목`);
  console.log(`    └ ${p.desc2}`);
});

// 잔차 vs D² 상관: 잔차가 D²와 상관 있으면 이상탐지에 기여
// (D²는 이전 분석의 6피처 기반 — 여기서 재계산)
const D2_FEATS = ['relVol', 'absRet1', 'volRatio', 'obImbalance', 'absTrStr', 'range'];
const anomRows = stocks.map((s, i) => ({
  relVol:      s.relVol,
  absRet1:     Math.abs(ret1Resid[i]),
  volRatio:    s.volRatio,
  obImbalance: Math.abs(s.obImbalance),
  absTrStr:    Math.abs(s.tradeStrength),
  range:       s.range
}));
const anomMat = anomRows.map(r => D2_FEATS.map(f => r[f]));
const { Z: anomZ, means: anomMeans, stds: anomStds } = zscoreMatrix(anomMat);
const { Slw: anomSlw, rho: lwRho } = ledoitWolfCov(anomZ);
const anomSInv = invertMatrix(anomSlw);
const D2_all = anomZ.map(z => mahalD2(z, anomSInv));

console.log('\n  [잔차 vs D² (이상 강도) 피어슨 상관]');
console.log('  해석: |ρ| > 0.15 → 잔차가 이상탐지에 독립 기여');
console.log('  ' + '─'.repeat(80));
residPairs.forEach(p => {
  const rho = pearson(p.resid.map(v => Math.abs(v)), D2_all);  // |잔차| vs D²
  const rhoRaw = pearson(p.resid, D2_all);
  const flag = Math.abs(rho) > 0.15 ? ' ★ 이상탐지 기여' : '';
  console.log(`  ${p.label.padEnd(18)} |잔차| ρ_D² = ${fmt(rho,4)}  (부호포함 ${fmt(rhoRaw,4)})${flag}`);
});

// 잔차 상위 극단 종목 (이상 후보)
console.log('\n  [잔차별 극단 종목 — 표준화 후 |z|>2 종목]');
residPairs.forEach(p => {
  const mu_ = mean(p.resid);
  const s_  = std(p.resid, mu_);
  const withZ = p.resid.map((v, i) => ({ z: (v - mu_) / (s_ < 1e-12 ? 1 : s_), stock: stocks[i], raw: v }));
  const extremes = withZ.filter(x => Math.abs(x.z) > 2).sort((a, b) => b.z - a.z);
  const topK = extremes.slice(0, 3);
  const botK = extremes.slice(-3).reverse();
  if (extremes.length === 0) { console.log(`  ${p.label}: 극단 없음`); return; }
  console.log(`\n  ${p.label} (σ=${fmt(s_,3)}):`);
  topK.forEach(x => console.log(`    ↑ ${x.stock.name.padEnd(16)} (${x.stock.theme})  z=+${fmt(x.z,2)}  raw=${fmt(x.raw,3)}`));
  botK.forEach(x => console.log(`    ↓ ${x.stock.name.padEnd(16)} (${x.stock.theme})  z=${fmt(x.z,2)}  raw=${fmt(x.raw,3)}`));
});

// ════════════════════════════════════════════════════════════════════
// 2. 조건부(strata) 분석 — 시총 3분위 + 코스피/코스닥별 약한 피처
// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
console.log('2. 조건부(strata) — 소형/중형/대형 + 코스피/코스닥별 약한 피처 분포');
console.log('════════════════════════════════════════════════════════════════════');

// 시총 3분위 경계
const caps = stocks.map(s => s.mktCap).sort((a, b) => a - b);
const capQ1 = caps[Math.floor(M / 3)];
const capQ2 = caps[Math.floor(2 * M / 3)];

function getStrata(s) {
  if (s.mktCap <= capQ1) return '소형';
  if (s.mktCap <= capQ2) return '중형';
  return '대형';
}

// 코스닥 여부: 테마에 '코스닥' 포함이거나 mktCap이 작은 종목 기준
// → 데이터에 시장 구분 필드가 없으므로, theme으로 추정:
//   코스피: 코스피·대형, 반도체(대형주 포함), AI·전력(일부 대형) — 정확한 구분 불가
//   대신 mktCap 분위로만 strata 구성, 코스닥 여부는 theme='코스닥' 명시 종목만 표시
function isKosdaq(s) {
  return s.theme === '코스닥';
}

// 약한 피처 목록: obImbalance, spread, tradeStrength (이전 분석에서 ρ 낮았던 피처들)
const WEAK_FEATS = ['obImbalance', 'spread', 'tradeStrength'];

// 테마 잔차 z-score 계산 (strata 안에서 이 피처들이 이상탐지와 얼마나 상관이 있나)
console.log(`\n  시총 분위 경계: 소형 ≤ ${fmt(capQ1,2)} < 중형 ≤ ${fmt(capQ2,2)} < 대형 (단위: 조원 추정)`);

// strata별로 obImbalance/spread/tradeStrength 분포 + D² 상관 계산
const strataList = ['소형', '중형', '대형'];

// 코스닥 그룹도 추가
const groups = [
  { label: '소형주', filter: s => getStrata(s) === '소형' },
  { label: '중형주', filter: s => getStrata(s) === '중형' },
  { label: '대형주', filter: s => getStrata(s) === '대형' },
  { label: '코스닥(테마)', filter: s => s.theme === '코스닥' },
  { label: '전체',   filter: s => true },
];

// D² z-score (전체 기준, 개별 종목 D² 이미 계산됨)
const D2z_all = (() => {
  const mu = mean(D2_all), s = std(D2_all, mu);
  return D2_all.map(v => s < 1e-12 ? 0 : (v - mu) / s);
})();

// 각 그룹 × 약한 피처별 분포 + D² 상관
console.log('\n  [그룹별 약한 피처 분포 + D² 피어슨 상관]');
console.log('  D² 상관 해석: |ρ| > 0.2 → 해당 그룹에서 이 피처가 이상탐지 신호로 의미 있음');
console.log('  ' + '─'.repeat(100));
console.log(
  '  그룹'.padEnd(16) +
  'N'.padStart(5) +
  WEAK_FEATS.map(f => f.padStart(16)).join('') +
  '  ← (|분포σ| / ρ_D²)'
);
console.log('  ' + '─'.repeat(100));

// 헤더
console.log('  ' + ' '.repeat(21) + WEAK_FEATS.map(f => ('σ / ρ').padStart(16)).join(''));

for (const g of groups) {
  const idxList = stocks.map((s, i) => i).filter(i => g.filter(stocks[i]));
  if (idxList.length < 5) continue;
  const gStocks = idxList.map(i => stocks[i]);
  const gD2z   = idxList.map(i => D2z_all[i]);
  const parts = WEAK_FEATS.map(feat => {
    const vals = gStocks.map(s => s[feat]);
    const s_ = std(vals, mean(vals));
    const rho = pearson(vals, gD2z);
    return { s_, rho };
  });
  const flag = parts.some(p => Math.abs(p.rho) > 0.2) ? ' ★' : '';
  const line = `  ${g.label.padEnd(16)}${String(idxList.length).padStart(5)}` +
    parts.map(p => `σ=${fmt(p.s_,2)} ρ=${fmt(p.rho,2)}`.padStart(16)).join('') + flag;
  console.log(line);
}

// 추가: 고RVOL 그룹 (relVol > 1.5 = 평소의 1.5배 이상)
const highRVOL = { label: '고RVOL(>1.5)', filter: s => s.relVol > 1.5 };
{
  const idxList = stocks.map((s, i) => i).filter(i => highRVOL.filter(stocks[i]));
  if (idxList.length >= 5) {
    const gStocks = idxList.map(i => stocks[i]);
    const gD2z   = idxList.map(i => D2z_all[i]);
    const parts = WEAK_FEATS.map(feat => {
      const vals = gStocks.map(s => s[feat]);
      const s_ = std(vals, mean(vals));
      const rho = pearson(vals, gD2z);
      return { s_, rho };
    });
    const flag = parts.some(p => Math.abs(p.rho) > 0.2) ? ' ★' : '';
    const line = `  ${highRVOL.label.padEnd(16)}${String(idxList.length).padStart(5)}` +
      parts.map(p => `σ=${fmt(p.s_,2)} ρ=${fmt(p.rho,2)}`.padStart(16)).join('') + flag;
    console.log(line);
  }
}

// 교호작용 심층: 소형 + 고RVOL 에서 obImbalance가 D²와 어떤 관계인가
console.log('\n  [교호작용: 소형 × 고RVOL에서 obImbalance 분포]');
{
  const sub = stocks.filter(s => getStrata(s) === '소형' && s.relVol > 1.0);
  const full = stocks;
  const obi_sub  = sub.map(s => s.obImbalance);
  const obi_full = full.map(s => s.obImbalance);

  const subD2 = sub.map((s, _) => {
    const idx = stocks.indexOf(s);
    return D2_all[idx];
  });
  const rho_sub  = pearson(obi_sub, subD2);
  const rho_full = pearson(obi_full, D2_all);

  console.log(`  소형 × RVOL>1 그룹: N=${sub.length}`);
  console.log(`    obImbalance 평균: ${fmt(mean(obi_sub),4)}  σ: ${fmt(std(obi_sub),4)}`);
  console.log(`    전체 평균: ${fmt(mean(obi_full),4)}  σ: ${fmt(std(obi_full),4)}`);
  console.log(`    D² 상관: 소형×고RVOL ρ=${fmt(rho_sub,4)}  vs 전체 ρ=${fmt(rho_full,4)}`);

  // 극단 obImbalance 종목들의 D² 분위 위치
  const subWithD2 = sub.map((s, i) => ({ name: s.name, theme: s.theme, obi: s.obImbalance, d2: subD2[i] }));
  subWithD2.sort((a, b) => Math.abs(b.obi) - Math.abs(a.obi));
  console.log('  소형×고RVOL 중 |obImbalance| 상위 5:');
  subWithD2.slice(0, 5).forEach(x => {
    console.log(`    ${x.name.padEnd(16)} obi=${fmt(x.obi,3)}  D²=${fmt(x.d2,2)}`);
  });
}

// ════════════════════════════════════════════════════════════════════
// 3. 미세 다중 vs 단일 극단 — 체계적 분리
// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
console.log('3. 미세 다중 vs 단일 극단 — |z|<2인데 D² 상위 종목 vs 단일 폭발 종목');
console.log('════════════════════════════════════════════════════════════════════');

// 각 종목별: 개별 피처 z-max + D²
const allScores = anomZ.map((z, idx) => {
  const d2 = D2_all[idx];
  const zabs = z.map(Math.abs);
  const zMax = Math.max(...zabs);
  const nOver2 = zabs.filter(v => v >= 2).length;   // 2σ 이상 피처 수
  const nOver1 = zabs.filter(v => v >= 1).length;   // 1σ 이상 피처 수
  const sumZ2 = zabs.reduce((s, v) => s + v * v, 0); // 단순 L2 norm²
  return {
    stock: stocks[idx],
    z, zabs, d2, zMax, nOver2, nOver1, sumZ2,
    theme: stocks[idx].theme,
    name: stocks[idx].name
  };
});

// D² 백분위
const D2sorted = [...D2_all].sort((a, b) => a - b);
function D2pct(v) { return D2sorted.filter(d => d <= v).length / D2sorted.length * 100; }

// 분류
// A) 미세 다중: z_max < 2, D² 상위 30%
const D2_p70 = D2sorted[Math.floor(0.70 * D2sorted.length)];
const D2_p90 = D2sorted[Math.floor(0.90 * D2sorted.length)];
const D2_p95 = D2sorted[Math.floor(0.95 * D2sorted.length)];

const microMulti = allScores.filter(s => s.zMax < 2.0 && s.d2 >= D2_p70)
  .sort((a, b) => b.d2 - a.d2);
const microMultiStrong = allScores.filter(s => s.zMax < 2.0 && s.d2 >= D2_p90)
  .sort((a, b) => b.d2 - a.d2);

// B) 단일 극단: z_max >= 3, 1개 피처가 D²의 70% 이상 기여
const SInv = anomSInv;
const singleExtreme = allScores.filter(s => {
  if (s.zMax < 3.0) return false;
  const Sinvz = SInv.map(row => row.reduce((a, v, j) => a + v * s.z[j], 0));
  const contrib = s.z.map((v, j) => v * Sinvz[j]);
  const total = contrib.reduce((a, v) => a + v, 0);
  const maxContrib = Math.max(...contrib);
  return maxContrib / total > 0.70;  // 1 피처가 70% 이상 지배
}).sort((a, b) => b.d2 - a.d2);

// C) 혼합: z_max 1~3 + nOver1 >= 3 (여러 피처가 1σ 이상)
const mixed = allScores.filter(s => s.zMax >= 1.5 && s.zMax < 3.0 && s.nOver1 >= 3)
  .sort((a, b) => b.d2 - a.d2);

console.log(`\n  D² 분위 경계: P70=${fmt(D2_p70,2)}  P90=${fmt(D2_p90,2)}  P95=${fmt(D2_p95,2)}`);
console.log(`\n  분류 결과:`);
console.log(`    (A) 미세 다중 (z_max<2, D²≥P70): ${microMulti.length}종목`);
console.log(`    (A') 미세 다중 강도 (z_max<2, D²≥P90): ${microMultiStrong.length}종목`);
console.log(`    (B) 단일 극단 (z_max≥3, 1피처≥70% 기여): ${singleExtreme.length}종목`);
console.log(`    (C) 혼합 (1.5≤z_max<3, 1σ이상 피처≥3): ${mixed.length}종목`);

// A: 미세 다중 목록 (D² P90 이상)
console.log(`\n  [A] 미세 다중 이상 (z_max<2이지만 D²≥P90) — OCI류`);
console.log('  ' + '─'.repeat(95));
console.log(
  '  종목명'.padEnd(18) + '테마'.padEnd(12) +
  'D²'.padStart(8) + '  D²%ile'.padStart(8) +
  '  z_max'.padStart(8) + '  nOver1σ'.padStart(10) +
  '  z배열[relVol,absRet,volRatio,obImbal,absTrStr,range]'
);
console.log('  ' + '─'.repeat(95));
microMultiStrong.slice(0, 12).forEach(s => {
  const pct = D2pct(s.d2);
  const zStr = s.z.map(v => fmt(v, 1)).join(' ');
  console.log(
    '  ' + s.name.padEnd(18) + s.theme.substring(0,11).padEnd(12) +
    fmt(s.d2,2).padStart(8) + fmt(pct,1).padStart(8) + '%' +
    fmt(s.zMax,2).padStart(8) + String(s.nOver1).padStart(10) +
    `  [${zStr}]`
  );
});

// B: 단일 극단 목록
console.log(`\n  [B] 단일 극단 (z_max≥3, 단일 피처 지배) — 금호타이어류`);
console.log('  ' + '─'.repeat(95));
singleExtreme.slice(0, 8).forEach(s => {
  const Sinvz = SInv.map(row => row.reduce((a, v, j) => a + v * s.z[j], 0));
  const contrib = s.z.map((v, j) => v * Sinvz[j]);
  const total = contrib.reduce((a, v) => a + v, 0);
  const topFeat = D2_FEATS[contrib.indexOf(Math.max(...contrib))];
  const topFrac = Math.max(...contrib) / total;
  console.log(
    `  ${s.name.padEnd(16)} (${s.theme.substring(0,10).padEnd(11)})` +
    `  D²=${fmt(s.d2,1)}  z_max=${fmt(s.zMax,2)}(${s.zabs.indexOf(s.zMax) >= 0 ? D2_FEATS[s.zabs.indexOf(Math.max(...s.zabs))] : '?'})` +
    `  주도피처=${topFeat}(${fmt(topFrac*100,0)}%)`
  );
});

// 핵심 비교: OCI홀딩스 상세
console.log('\n  [OCI홀딩스 상세 — joint anomaly 해부]');
const ociIdx = stocks.findIndex(s => s.name.includes('OCI'));
if (ociIdx >= 0) {
  const oci = allScores[ociIdx];
  const Sinvz = SInv.map(row => row.reduce((a, v, j) => a + v * oci.z[j], 0));
  const contrib = oci.z.map((v, j) => v * Sinvz[j]);
  console.log(`  ${oci.name} (${oci.theme}):`);
  console.log(`    D²=${fmt(oci.d2,2)}  z_max=${fmt(oci.zMax,2)}  nOver1σ=${oci.nOver1}  D²%ile=${fmt(D2pct(oci.d2),1)}%`);
  D2_FEATS.forEach((f, i) => {
    const bar = '▓'.repeat(Math.round(Math.abs(oci.z[i])));
    const sign = oci.z[i] >= 0 ? '+' : '';
    console.log(`    ${f.padEnd(14)} z=${sign}${fmt(oci.z[i],2).padStart(5)}  기여=${fmt(contrib[i],2).padStart(6)}  ${bar}`);
  });
}

// 산포 요약: z_max vs D² 의 상관 구조
console.log('\n  [z_max vs D² 산포 요약]');
const zmaxArr = allScores.map(s => s.zMax);
const rho_zmax_D2 = pearson(zmaxArr, D2_all);
console.log(`  전체 pearson(z_max, D²) = ${fmt(rho_zmax_D2,4)}`);
console.log(`  해석: ${Math.abs(rho_zmax_D2) > 0.8 ? 'z_max와 D²가 거의 동일 → joint anomaly 포착력 없음' :
              Math.abs(rho_zmax_D2) > 0.5 ? 'z_max와 D² 중간 수준 상관 → 부분적으로 다른 종목 포착' :
              '낮은 상관 → D²가 z_max 이외 독립 정보 포착'}`);

// D² 분위별 z_max 분포
console.log('\n  D² 분위별 z_max 분포:');
[[0, 0.5], [0.5, 0.75], [0.75, 0.9], [0.9, 1.0]].forEach(([lo, hi]) => {
  const cut_lo = D2sorted[Math.floor(lo * D2sorted.length)];
  const cut_hi = hi === 1.0 ? Infinity : D2sorted[Math.floor(hi * D2sorted.length)];
  const grp = allScores.filter(s => s.d2 >= cut_lo && s.d2 < cut_hi);
  const zmaxGrp = grp.map(s => s.zMax);
  const mu = mean(zmaxGrp), s_ = std(zmaxGrp, mu);
  const under2 = grp.filter(s => s.zMax < 2).length;
  console.log(
    `    D² [P${Math.round(lo*100)}-P${Math.round(hi*100)}]: N=${grp.length}  z_max 평균=${fmt(mu,2)}  σ=${fmt(s_,2)}  z_max<2 비율=${fmt(under2/grp.length*100,1)}%`
  );
});

// ════════════════════════════════════════════════════════════════════
// 4. 구분 — 구조적 real vs 가설 라벨 + 살릴 미세신호 후보
// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
console.log('4. 구분 — 구조적 real vs 가설(regime 의존) 라벨');
console.log('════════════════════════════════════════════════════════════════════');

// 각 잔차 피처 + 조건부 피처의 증거 강도 정량화
// "구조적 real": 직교 잔차 = 정의상 독립, 단면 데이터만으로 정당
// "가설": 조건부 상관이 이 단면에서도 나타나는지만 확인 가능, 인과는 시계열 필요

const candidates = [];

// (1) atr14 ⊥ vol20 잔차 — 구조적 real
{
  const rhoD2 = pearson(res_atr_vol.map(v => Math.abs(v)), D2_all);
  const zArr_ = res_atr_vol.map(v => { const mu = mean(res_atr_vol), s = std(res_atr_vol, mu); return (v-mu)/(s<1e-12?1:s); });
  const n3 = zArr_.filter(v => Math.abs(v) > 3).length;
  candidates.push({
    signal: 'atr14 ⊥ vol20 잔차',
    label: '구조적 real',
    rationale: '직교 잔차는 정의상 vol20과 독립. "거래량으로 설명 안 되는 일중 변동" = 기관 슬리피지 또는 장중 이벤트.',
    rhoD2, n3over: n3,
    strength: Math.abs(rhoD2) > 0.15 ? '★ 이상탐지 기여 확인' : '△ 기여 미미'
  });
}

// (2) ret20 ⊥ ret5 잔차 — 구조적 real
{
  const rhoD2 = pearson(res_ret20_ret5.map(v => Math.abs(v)), D2_all);
  const zArr_ = res_ret20_ret5.map(v => { const mu = mean(res_ret20_ret5), s = std(res_ret20_ret5, mu); return (v-mu)/(s<1e-12?1:s); });
  const n3 = zArr_.filter(v => Math.abs(v) > 3).length;
  candidates.push({
    signal: 'ret20 ⊥ ret5 (모멘텀 지속성)',
    label: '구조적 real',
    rationale: '단기 수익과 직교한 중기 성과 = 단기 반등이 아닌 중기 추세 지속. 단면으로 정의 가능.',
    rhoD2, n3over: n3,
    strength: Math.abs(rhoD2) > 0.15 ? '★ 이상탐지 기여 확인' : '△ 기여 미미'
  });
}

// (3) body ⊥ ret1 잔차 — 구조적 real
{
  const rhoD2 = pearson(res_body_ret1.map(Math.abs), D2_all);
  const zArr_ = res_body_ret1.map(v => { const mu = mean(res_body_ret1), s = std(res_body_ret1, mu); return (v-mu)/(s<1e-12?1:s); });
  const n3 = zArr_.filter(v => Math.abs(v) > 3).length;
  candidates.push({
    signal: 'body ⊥ ret1 (방향성 강도)',
    label: '구조적 real',
    rationale: '봉 몸통과 수익률은 수학적으로 상관 있지만 잔차 = 봉의 "알맹이 비율" 신호 (수염 없이 빡빡한 봉).',
    rhoD2, n3over: n3,
    strength: Math.abs(rhoD2) > 0.15 ? '★ 이상탐지 기여 확인' : '△ 기여 미미'
  });
}

// (4) turnover ⊥ mktCap 잔차 — 구조적 real
{
  const rhoD2 = pearson(res_to_cap.map(Math.abs), D2_all);
  const zArr_ = res_to_cap.map(v => { const mu = mean(res_to_cap), s = std(res_to_cap, mu); return (v-mu)/(s<1e-12?1:s); });
  const n3 = zArr_.filter(v => Math.abs(v) > 3).length;
  candidates.push({
    signal: 'turnover ⊥ mktCap (순수 자금유입)',
    label: '구조적 real',
    rationale: '시총 규모 통제 후 초과 거래대금 = 해당 종목에만 쏠린 자금. mktCap≈turnover라 버렸지만 잔차는 독립.',
    rhoD2, n3over: n3,
    strength: Math.abs(rhoD2) > 0.15 ? '★ 이상탐지 기여 확인' : '△ 기여 미미'
  });
}

// (5) 소형주 obImbalance — 가설
{
  const sub = stocks.filter(s => getStrata(s) === '소형');
  const subIdx = stocks.map((s, i) => i).filter(i => getStrata(stocks[i]) === '소형');
  const obi_sub = sub.map(s => s.obImbalance);
  const d2_sub  = subIdx.map(i => D2_all[i]);
  const rhoD2 = pearson(obi_sub.map(Math.abs), d2_sub);
  const rhoFull = pearson(stocks.map(s => Math.abs(s.obImbalance)), D2_all);
  candidates.push({
    signal: 'obImbalance (소형주 한정)',
    label: '가설',
    rationale: `소형주 N=${sub.length}에서 |obImbalance|↔D² ρ=${fmt(rhoD2,3)} vs 전체 ρ=${fmt(rhoFull,3)}. 소형주에서 신호가 강해진다면 교호작용 존재. 인과 확인엔 시계열 필요.`,
    rhoD2: rhoD2,
    n3over: null,
    strength: Math.abs(rhoD2) > Math.abs(rhoFull) + 0.05 ? '★ 소형주에서 강화' : '△ 유의한 교호작용 없음'
  });
}

// (6) 미세 다중 이상 (joint anomaly) — 구조적 real
{
  const mmCount = microMultiStrong.length;
  candidates.push({
    signal: '미세 다중 이상 (z_max<2, D²≥P90)',
    label: '구조적 real',
    rationale: `단일 피처 보면 정상(z<2)이지만 6개 피처가 동시에 1σ 정도 이탈 → D²가 포착. ${mmCount}종목. 정의상 단면에서 식별 가능.`,
    rhoD2: null,
    n3over: mmCount,
    strength: mmCount > 5 ? '★ 충분한 사례 확인' : '△ 사례 희소'
  });
}

// 출력
console.log('\n  신호 후보별 구분 평가:');
console.log('  ' + '═'.repeat(95));
candidates.forEach((c, i) => {
  console.log(`\n  [${i+1}] ${c.signal}`);
  console.log(`       라벨: ${c.label}  /  강도: ${c.strength}`);
  if (c.rhoD2 !== null) console.log(`       |잔차| ↔ D² ρ = ${fmt(c.rhoD2, 4)}`);
  if (c.n3over !== null) console.log(`       |z|>3 종목 수: ${c.n3over}  (사례 희소성 지표)`);
  console.log(`       근거: ${c.rationale}`);
});

// ════════════════════════════════════════════════════════════════════
// 검증 케이스: 피처셋 A(기존 6) vs 피처셋 B(기존 6 + 살린 잔차 2개) D² 비교
// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
console.log('검증: 피처셋 A(기존 6) vs B(+atr14⊥vol20 잔차 +ret20⊥ret5 잔차) D² 비교');
console.log('════════════════════════════════════════════════════════════════════');

// B 피처셋: 기존 6 + 2 잔차 (표준화)
// atr14_resid: res_atr_vol (이미 계산)
// ret20_resid: res_ret20_ret5 (이미 계산)
const BFEATS = [...D2_FEATS, 'atr14_res', 'ret20_res'];
const bMat = stocks.map((s, i) => [
  s.relVol,
  Math.abs(ret1Resid[i]),
  s.volRatio,
  Math.abs(s.obImbalance),
  Math.abs(s.tradeStrength),
  s.range,
  res_atr_vol[i],          // 새 잔차 1
  res_ret20_ret5[i]         // 새 잔차 2
]);

const { Z: bZ } = zscoreMatrix(bMat);
const { Slw: bSlw } = ledoitWolfCov(bZ);
const bSInv = invertMatrix(bSlw);
const D2_B = bZ.map(z => mahalD2(z, bSInv));

// D² A vs B 의 상관 (대부분 같아야 함, 하지만 달라지는 종목이 흥미로운 케이스)
const rho_AB = pearson(D2_all, D2_B);
console.log(`\n  A↔B D² 피어슨 상관: ρ=${fmt(rho_AB,4)}`);
console.log(`  해석: ρ<0.95이면 새 잔차가 순위를 바꾸는 종목 존재 → 잔차 추가 가치 있음`);

// 순위 변화 가장 큰 종목
const rankA = D2_all.map((d, i) => ({ i, d })).sort((a, b) => b.d - a.d).map((x, r) => ({ ...x, rankA: r+1 }));
const rankB = D2_B.map((d, i) => ({ i, d })).sort((a, b) => b.d - a.d).map((x, r) => ({ ...x, rankB: r+1 }));
const rankMap = {};
rankA.forEach(x => { rankMap[x.i] = { rankA: x.rankA }; });
rankB.forEach(x => { rankMap[x.i].rankB = x.rankB; });

const rankDiff = Object.entries(rankMap).map(([i, r]) => ({
  stock: stocks[Number(i)], i: Number(i),
  rankA: r.rankA, rankB: r.rankB,
  diff: r.rankA - r.rankB  // 양수: B에서 더 위로 올라감 (새 잔차 추가로 이상 포착됨)
})).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

console.log('\n  A→B 순위 가장 많이 오른 종목 (새 잔차 추가로 포착됨):');
rankDiff.filter(r => r.diff > 0).slice(0, 6).forEach(r => {
  console.log(`  ${r.stock.name.padEnd(16)} (${r.stock.theme})  A위=${r.rankA}→B위=${r.rankB}  (↑${r.diff}위)`);
});
console.log('\n  A→B 순위 가장 많이 떨어진 종목 (새 잔차 추가 시 상대적으로 덜 이상):');
rankDiff.filter(r => r.diff < 0).slice(0, 6).forEach(r => {
  console.log(`  ${r.stock.name.padEnd(16)} (${r.stock.theme})  A위=${r.rankA}→B위=${r.rankB}  (↓${Math.abs(r.diff)}위)`);
});

// ════════════════════════════════════════════════════════════════════
// 최종 요약
// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
console.log('【심층 발견】— 살릴 미세신호 후보 및 구분');
console.log('════════════════════════════════════════════════════════════════════');

console.log(`
[심층 발견 1] atr14 ⊥ vol20 잔차 — 구조적 real ★
  - vol20 설명력 R²=${fmt(R2_atr_vol,3)}: ATR의 ${fmt((1-R2_atr_vol)*100,1)}%가 거래량으로 설명 안 됨
  - 잔차 = "가격이동 효율성": 거래량 없이 크게 움직였거나 거래량 대비 적게 움직임
  - |잔차| ↔ D² ρ=${fmt(pearson(res_atr_vol.map(Math.abs), D2_all),4)}: 이상탐지 기여도
  - 의미: 호가 폭탄·기관 사이즈 주문·뉴스 갭 → 거래 없이 ATR만 터지는 신호
  - 살림 여부: ${Math.abs(pearson(res_atr_vol.map(Math.abs), D2_all)) > 0.1 ? '살림 (피처셋에 추가)' : '보류 (기여 낮음)'}

[심층 발견 2] ret20 ⊥ ret5 잔차 (모멘텀 지속성) — 구조적 real ★
  - ret5 설명력 R²=${fmt(R2_ret20_ret5,3)}: ret20의 ${fmt((1-R2_ret20_ret5)*100,1)}%가 독립
  - 잔차 양수 = "단기 바닥반등이 아닌 중기 추세" / 잔차 음수 = "단기만 튀고 20일은 부진"
  - |잔차| ↔ D² ρ=${fmt(pearson(res_ret20_ret5.map(Math.abs), D2_all),4)}
  - 의미: ret5만 보면 놓치는 모멘텀 가속/감속 신호 (추세 지속 여부)
  - 살림 여부: ${Math.abs(pearson(res_ret20_ret5.map(Math.abs), D2_all)) > 0.1 ? '살림 (가속 지표)' : '보류'}

[심층 발견 3] body ⊥ ret1 잔차 (봉 방향성 강도) — 구조적 real
  - ret1 설명력 R²=${fmt(R2_body_ret1,3)}: body의 ${fmt((1-R2_body_ret1)*100,1)}%가 독립 잔차
  - 잔차 = "수익률 대비 봉 몸통이 꽉 찬 정도" → 위아래 수염 없이 한 방향 결집 신호
  - 의미: 강한 방향성 압박(매수 또는 매도 일방). 레이더에서 방향성 강도 보조지표 가능
  - 살림 여부: 보조 신호로 활용 (단독은 약, ret1 잔차 + body잔차 결합 시 강화)

[심층 발견 4] 소형주 × 고RVOL에서 obImbalance 교호작용 — 가설
  - 소형주+RVOL>1 그룹: obImbalance의 D² 상관이 전체 대비 변화
  - 인과 해석엔 시계열 필요. 단면만으로는 교호작용 확인 수준.
  - 살림 여부: 가설 표시 후 조건부 가중치 시도 가능 (소형주에서 obImbalance 가중치 2×)

[심층 발견 5] 미세 다중 이상 (z_max<2이지만 D²≥P90) — 구조적 real ★★
  - ${microMultiStrong.length}종목: 단일 피처 z-max 2 미만이지만 D² 상위 10%
  - 이 종목들은 z-score 스크리닝에서 완전히 누락 → D² 없이는 탐지 불가
  - 대표 종목: ${microMultiStrong.slice(0,3).map(s => s.name).join(', ')}
  - 살림 여부: D² 반드시 유지. 단순 z 합산 방식은 이 종목들을 놓침

[심층 발견 6] D²와 z_max 순위 일치도: ρ=${fmt(rho_zmax_D2,4)}
  - 피처셋 A vs B(잔차 추가) 순위 상관: ρ=${fmt(rho_AB,4)}
  - 새 잔차 추가 시 상위 이탈 종목: ${rankDiff.filter(r => r.diff > 5).slice(0,3).map(r => r.stock.name).join(', ') || '없음 (순위 안정)'}

─────────────────────────────────────────────────────────────────────
【살릴 미세신호 후보 (우선순위 순)】
  1. [구조적 real] atr14 ⊥ vol20 잔차 — D² 기여 확인 시 피처셋 추가
  2. [구조적 real] D² 자체 (Ledoit-Wolf) — 미세다중 탐지 핵심, z_max 스크리닝 보완
  3. [구조적 real] ret20 ⊥ ret5 잔차 — 모멘텀 지속성 (레이더 Y축 보조지표)
  4. [구조적 real] body ⊥ ret1 잔차 — 방향성 강도 보조
  5. [가설] obImbalance (소형주 한정 가중) — 시계열 검증 후 조건부 적용 권장
─────────────────────────────────────────────────────────────────────
`);
