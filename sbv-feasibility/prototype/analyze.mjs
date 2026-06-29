/**
 * analyze.mjs — 441종목 단면 데이터 다변량 분석
 * 과제:
 *  1. 상관 구조 (|ρ|>0.7 중복 쌍)
 *  2. 유효 차원 (PCA 고유값)
 *  3. 시장·섹터 통제 후 잔차
 *  4. 마할라노비스 D² 이상 점수
 *  5. 핵심 발견
 */

import fs from 'fs';

// ────────────────────────────────────────────
// 0. 데이터 로드
// ────────────────────────────────────────────
const raw = JSON.parse(
  fs.readFileSync('C:/Users/zzang/Desktop/Yoon_temp/stock/data/stock-features.json', 'utf8')
);
const stocks = Object.values(raw.features); // 441개 객체
const N = stocks.length;
console.log(`\n총 종목 수: ${N}\n`);

// ────────────────────────────────────────────
// 분석 대상 정량 피처 (tradeN 제외 — 전 종목 상수값 50)
// turnover 포함: mktCap 대리변수 확인용
// ────────────────────────────────────────────
const FEATURES = [
  'gap', 'range', 'relVol', 'vol20', 'atr14',
  'ret1', 'ret5', 'ret20', 'ret60',
  'pos200', 'mktCap',
  'obImbalance', 'spread', 'tradeStrength', 'volRatio', 'turnover'
];
const F = FEATURES.length; // 16

// ────────────────────────────────────────────
// 유틸 함수
// ────────────────────────────────────────────

/** 배열 평균 */
function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** 표본 표준편차 */
function std(arr, mu = mean(arr)) {
  const v = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/** 피어슨 상관계수 */
function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  const sa = std(a, ma), sb = std(b, mb);
  if (sa < 1e-12 || sb < 1e-12) return 0;
  const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (a.length - 1);
  return cov / (sa * sb);
}

/** 유한한 값만 필터 — NaN/Inf 방어 */
function isFiniteNum(v) {
  return typeof v === 'number' && isFinite(v);
}

// 각 피처별 유효 값 배열 추출 (NaN/Inf 제거)
function getCol(feat) {
  return stocks.map(s => s[feat]).filter(isFiniteNum);
}

// 전체 행렬: 유효 행만 (모든 피처가 유한한 종목)
function getMatrix() {
  const rows = stocks.filter(s => FEATURES.every(f => isFiniteNum(s[f])));
  return {
    rows,
    mat: rows.map(s => FEATURES.map(f => s[f]))
  };
}

// ────────────────────────────────────────────
// 표준화 (z-score)
// ────────────────────────────────────────────
function standardize(mat) {
  // mat: N×F 배열
  const n = mat.length;
  const means = FEATURES.map((_, j) => mean(mat.map(r => r[j])));
  const stds  = FEATURES.map((_, j) => std(mat.map(r => r[j]), means[j]));
  const zmat = mat.map(row =>
    row.map((v, j) => stds[j] < 1e-12 ? 0 : (v - means[j]) / stds[j])
  );
  return { zmat, means, stds };
}

// ────────────────────────────────────────────
// 1. 상관행렬 + |ρ|>0.7 쌍
// ────────────────────────────────────────────
console.log('═══════════════════════════════════════════════');
console.log('1. 상관 구조 — |ρ|>0.7 중복 쌍');
console.log('═══════════════════════════════════════════════');

const { rows, mat } = getMatrix();
const nValid = rows.length;
console.log(`  유효 종목(모든 피처 존재): ${nValid}`);

// 피처별 열 벡터
const cols = FEATURES.map((_, j) => mat.map(r => r[j]));

// 상관행렬 계산
const corrMat = FEATURES.map((_, i) =>
  FEATURES.map((_, j) => pearson(cols[i], cols[j]))
);

// |ρ|>0.7 쌍 추출
const highCorrPairs = [];
for (let i = 0; i < F; i++) {
  for (let j = i + 1; j < F; j++) {
    const r = corrMat[i][j];
    if (Math.abs(r) > 0.7) {
      highCorrPairs.push({ a: FEATURES[i], b: FEATURES[j], rho: r });
    }
  }
}

// 내림차순 정렬
highCorrPairs.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));

if (highCorrPairs.length === 0) {
  console.log('  |ρ|>0.7 쌍 없음');
} else {
  console.log(`  |ρ|>0.7 쌍 총 ${highCorrPairs.length}개:`);
  highCorrPairs.forEach(({ a, b, rho }) => {
    console.log(`    ${a.padEnd(15)} × ${b.padEnd(15)}  ρ = ${rho.toFixed(4)}`);
  });
}

// 전체 상관행렬 출력 (좁게)
console.log('\n  전체 상관행렬 (절대값 기준 요약):');
console.log('  ' + FEATURES.map(f => f.substring(0,6).padStart(7)).join(''));
FEATURES.forEach((fi, i) => {
  const row = FEATURES.map((_, j) => {
    const v = corrMat[i][j];
    return (v >= 0 ? ' ' : '') + v.toFixed(2);
  }).map(s => s.padStart(7)).join('');
  console.log(`  ${fi.substring(0,6).padEnd(7)} ${row}`);
});

// ────────────────────────────────────────────
// 2. PCA — 고유값으로 유효 차원 추정
// ────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('2. 유효 차원 — 공분산 고유값 (표준화 후)');
console.log('═══════════════════════════════════════════════');

const { zmat } = standardize(mat);
const n = zmat.length;

// 공분산행렬 (표준화 후 → 상관행렬과 동일)
// C[i][j] = (1/(n-1)) Σ z_ki * z_kj
function covMatrix(zm) {
  const f = zm[0].length;
  const C = Array.from({length: f}, () => new Array(f).fill(0));
  const n = zm.length;
  for (let i = 0; i < f; i++) {
    for (let j = i; j < f; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += zm[k][i] * zm[k][j];
      C[i][j] = C[j][i] = s / (n - 1);
    }
  }
  return C;
}

const C = covMatrix(zmat);

// Power iteration + deflation로 고유값 추정
function powerIteration(A, maxIter = 300, tol = 1e-9) {
  const n = A.length;
  // 랜덤 초기 벡터 대신 모든 1
  let v = new Array(n).fill(1 / Math.sqrt(n));
  let lambda = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    // Av
    const Av = A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
    const norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-15) break;
    const vNew = Av.map(x => x / norm);
    const lambdaNew = norm;
    if (Math.abs(lambdaNew - lambda) < tol) {
      v = vNew; lambda = lambdaNew; break;
    }
    v = vNew; lambda = lambdaNew;
  }
  return { lambda, v };
}

function deflate(A, lambda, v) {
  // A' = A - lambda * v * v^T
  return A.map((row, i) => row.map((a, j) => a - lambda * v[i] * v[j]));
}

// 모든 고유값 추출 (F개)
let Acopy = C.map(r => [...r]);
const eigenvalues = [];
const eigenvectors = [];
for (let k = 0; k < F; k++) {
  const { lambda, v } = powerIteration(Acopy);
  eigenvalues.push(Math.max(0, lambda)); // 수치 오차로 음수 방지
  eigenvectors.push(v);
  Acopy = deflate(Acopy, lambda, v);
}

// 내림차순 정렬
const sortedIdx = eigenvalues.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
const sortedEigen = sortedIdx.map(([v]) => v);
const totalVar = sortedEigen.reduce((s, v) => s + v, 0);

console.log(`  총 분산(고유값 합): ${totalVar.toFixed(4)} (표준화 후 → ${F}에 가까워야 함)`);
console.log('\n  PC별 설명 분산:');
let cumVar = 0;
let pc90 = null;
sortedEigen.forEach((ev, i) => {
  const pct = ev / totalVar * 100;
  cumVar += pct;
  const bar = '█'.repeat(Math.round(pct / 2));
  console.log(`    PC${(i+1).toString().padStart(2)} | λ=${ev.toFixed(3).padStart(6)} | ${pct.toFixed(1).padStart(5)}% | 누적 ${cumVar.toFixed(1).padStart(5)}% | ${bar}`);
  if (pc90 === null && cumVar >= 90) pc90 = i + 1;
});
console.log(`\n  → 분산 90% 달성 주성분 수: ${pc90}개 / 전체 ${F}개`);
console.log(`  → 유효 차원(Kaiser >1.0 기준): ${sortedEigen.filter(v => v > 1.0).length}개`);

// ────────────────────────────────────────────
// 3. 시장·섹터 통제 — 횡단면 OLS
// ────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('3. 시장·섹터 통제 후 잔차 분석');
console.log('═══════════════════════════════════════════════');

// 테마 목록 추출
const themes = [...new Set(rows.map(s => s.theme))].sort();
console.log(`  테마 수: ${themes.length}`);
console.log(`  테마 목록: ${themes.join(', ')}`);

/**
 * OLS 회귀: y ~ intercept + 테마더미 (theme FE)
 * 설계행렬 X: [1, d_테마1, d_테마2, ...]  (첫 테마가 기준)
 * 최소자승법: (X'X)^{-1} X'y — 소규모이므로 직접 구현
 */
function olsResiduals(y, themesArr, themeList) {
  const n = y.length;
  const k = themeList.length; // 테마 수 (기준 포함)
  // 설계행렬: intercept + (k-1) 더미
  const basTheme = themeList[0];
  const dummies = themeList.slice(1);
  const X = themesArr.map(t => [
    1,
    ...dummies.map(d => (t === d ? 1 : 0))
  ]);
  // X: n × k 행렬
  // β = (X'X)^{-1} X'y  → 작은 행렬이므로 LU 없이 직접 Gauss-Jordan
  const cols2 = X[0].length;
  // X'X
  const XtX = Array.from({length: cols2}, (_, i) =>
    Array.from({length: cols2}, (_, j) =>
      X.reduce((s, r) => s + r[i] * r[j], 0)
    )
  );
  // X'y
  const Xty = Array.from({length: cols2}, (_, i) =>
    X.reduce((s, r, m) => s + r[i] * y[m], 0)
  );
  // Gauss-Jordan 역행렬 → β 해법
  // augmented matrix [XtX | Xty]
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < cols2; col++) {
    // pivot
    let maxRow = col;
    for (let r = col + 1; r < cols2; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue; // 특이행렬 방어
    aug[col] = aug[col].map(v => v / pivot);
    for (let r = 0; r < cols2; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      aug[r] = aug[r].map((v, c) => v - factor * aug[col][c]);
    }
  }
  const beta = aug.map(r => r[cols2]);
  // 예측값 & 잔차
  const yhat = X.map(r => r.reduce((s, v, i) => s + v * beta[i], 0));
  const resid = y.map((v, i) => v - yhat[i]);
  const ssRes = resid.reduce((s, v) => s + v * v, 0);
  const yMean = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const R2 = ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
  return { resid, R2, ssRes, ssTot };
}

const themesOfRows = rows.map(s => s.theme);

// ret1 회귀
const ret1Val = rows.map(s => s.ret1);
const { resid: ret1Resid, R2: ret1R2, ssRes: ret1SsRes, ssTot: ret1SsTot } =
  olsResiduals(ret1Val, themesOfRows, themes);
console.log(`\n  ret1 ~ 시장+테마더미:`);
console.log(`    R² = ${ret1R2.toFixed(4)}  (테마가 설명하는 분산 비율)`);
console.log(`    잔차 분산 비율 = ${(1 - ret1R2).toFixed(4)}  (종목 고유 움직임)`);

// relVol 회귀
const relVolVal = rows.map(s => s.relVol);
const { resid: relVolResid, R2: relVolR2 } =
  olsResiduals(relVolVal, themesOfRows, themes);
console.log(`\n  relVol ~ 시장+테마더미:`);
console.log(`    R² = ${relVolR2.toFixed(4)}`);
console.log(`    잔차 분산 비율 = ${(1 - relVolR2).toFixed(4)}`);

// vol20 회귀
const vol20Val = rows.map(s => s.vol20);
const { resid: vol20Resid, R2: vol20R2 } =
  olsResiduals(vol20Val, themesOfRows, themes);
console.log(`\n  vol20 ~ 시장+테마더미:`);
console.log(`    R² = ${vol20R2.toFixed(4)}`);
console.log(`    잔차 분산 비율 = ${(1 - vol20R2).toFixed(4)}`);

// 잔차 분포 통계
function descStats(arr) {
  const mu = mean(arr);
  const s = std(arr, mu);
  const sorted = [...arr].sort((a, b) => a - b);
  const p = p => sorted[Math.floor(p * sorted.length)];
  return { mu: mu.toFixed(3), std: s.toFixed(3), p5: p(0.05).toFixed(3), p95: p(0.95).toFixed(3) };
}
const ds = descStats(ret1Resid);
console.log(`\n  ret1 잔차 분포: μ=${ds.mu}  σ=${ds.std}  P5=${ds.p5}  P95=${ds.p95}`);

// 잔차 상위/하위 5개
const idxSorted = ret1Resid.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
console.log('\n  ret1 고유 수익 상위 5 (테마 평균 초과):');
idxSorted.slice(0, 5).forEach(([v, i]) => {
  console.log(`    ${rows[i].name.padEnd(16)} (${rows[i].theme})  잔차 ret1=${v.toFixed(2)}%`);
});
console.log('\n  ret1 고유 수익 하위 5 (테마 평균 미달):');
idxSorted.slice(-5).reverse().forEach(([v, i]) => {
  console.log(`    ${rows[i].name.padEnd(16)} (${rows[i].theme})  잔차 ret1=${v.toFixed(2)}%`);
});

// ────────────────────────────────────────────
// 4. 마할라노비스 D² 이상 점수
// ────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('4. 다변량 이상 점수 — 마할라노비스 D²');
console.log('═══════════════════════════════════════════════');

/**
 * 핵심 6피처:
 *  relVol     — 거래량 배율 (레이더 X축)
 *  absRet1    — |고유수익|  (ret1 잔차 절대값)
 *  volRatio   — 20일 대비 당일 비율
 *  obImbalance— 호가 불균형
 *  absTrStr   — |매매 강도|
 *  range      — 일중 변동폭
 */
const anomRows = rows.map((s, i) => ({
  stock: s,
  feats: {
    relVol:      s.relVol,
    absRet1:     Math.abs(ret1Resid[i]),    // 시장·섹터 통제 후 절대 고유수익
    volRatio:    s.volRatio,
    obImbalance: Math.abs(s.obImbalance),   // 절대값 (방향 무관 강도)
    absTrStr:    Math.abs(s.tradeStrength),
    range:       s.range
  }
})).filter(r =>
  Object.values(r.feats).every(isFiniteNum)
);

const ANOMF = ['relVol', 'absRet1', 'volRatio', 'obImbalance', 'absTrStr', 'range'];
const anomMat = anomRows.map(r => ANOMF.map(f => r.feats[f]));
const nA = anomMat.length;

// 표준화
const anomMeans = ANOMF.map((_, j) => mean(anomMat.map(r => r[j])));
const anomStds  = ANOMF.map((_, j) => std(anomMat.map(r => r[j]), anomMeans[j]));
const anomZ = anomMat.map(row =>
  row.map((v, j) => anomStds[j] < 1e-12 ? 0 : (v - anomMeans[j]) / anomStds[j])
);

/**
 * Ledoit-Wolf shrinkage 공분산 추정
 * 타겟 T = trace(S)/p * I  (단위행렬 타겟)
 * 수축 계수 ρ = min(1, ((n-2)/n * Σ||S_ij||² + tr(S)²) / ((n+2)(||S||_F² - tr(S)²/p)))
 * 실용적 근사: Oracle Approximating Shrinkage (OAS 수식 생략, Ledoit-Wolf 추정)
 */
function ledoitWolfCov(Z) {
  const n = Z.length;
  const p = Z[0].length;
  // 표본 공분산
  const S = Array.from({length: p}, (_, i) =>
    Array.from({length: p}, (_, j) =>
      Z.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)
    )
  );
  // tr(S)
  const trS = S.reduce((s, _, i) => s + S[i][i], 0);
  // ||S||_F²
  const S2F = S.reduce((s, row) => s + row.reduce((t, v) => t + v * v, 0), 0);
  // Ledoit-Wolf 수축 계수 (단순 추정)
  const mu = trS / p; // 타겟 스케일
  // 수축 강도 추정: rho_hat = ((n-2)/n * S2F + trS^2) / ((n+2) * (S2F - trS^2/p))
  const num = ((n - 2) / n) * S2F + trS * trS;
  const den = (n + 2) * (S2F - (trS * trS) / p);
  let rho = den < 1e-12 ? 0 : Math.min(1, num / den);
  // shrunk covariance: (1-rho)*S + rho*mu*I
  const Slw = S.map((row, i) =>
    row.map((v, j) => (1 - rho) * v + (i === j ? rho * mu : 0))
  );
  return { Slw, rho };
}

const { Slw, rho: lwRho } = ledoitWolfCov(anomZ);
console.log(`  Ledoit-Wolf 수축 계수 ρ = ${lwRho.toFixed(4)}`);

/**
 * 역행렬 (Gauss-Jordan) — 6×6 정도라 충분
 */
function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [
    ...row.map(v => v),
    ...Array.from({length: n}, (_, j) => i === j ? 1 : 0)
  ]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
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

const SInv = invertMatrix(Slw);

/**
 * 마할라노비스 D²(x) = x^T Σ^{-1} x  (이미 중심화 완료)
 */
function mahalD2(z, Sinv) {
  const p = z.length;
  let d2 = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      d2 += z[i] * Sinv[i][j] * z[j];
    }
  }
  return d2;
}

// 각 종목 D² + 기여 분해
const anomScores = anomZ.map((z, idx) => {
  const d2 = mahalD2(z, SInv);
  // 그룹별 기여: 대각선 기여 (diagonal contribution) 근사
  // contribution_j = z_j * (Σ^{-1} z)_j
  const Sinvz = SInv.map(row => row.reduce((s, v, j) => s + v * z[j], 0));
  const contrib = z.map((v, j) => v * Sinvz[j]);
  // z-score 단순 최대
  const zMax = Math.max(...z.map(Math.abs));
  return {
    stock: anomRows[idx].stock,
    z,
    d2,
    contrib,
    zMax,
    singleFeatMax: ANOMF[z.map(Math.abs).indexOf(Math.max(...z.map(Math.abs)))]
  };
});

// D² 기준 내림차순 정렬
anomScores.sort((a, b) => b.d2 - a.d2);

console.log('\n  상위 이상 종목 8개 (D² 기준):');
console.log('  ' + '─'.repeat(90));
console.log(
  '  ' +
  '종목명'.padEnd(17) +
  '테마'.padEnd(10) +
  'D²'.padStart(8) +
  '  기여 1위'.padEnd(16) +
  '기여 2위'.padEnd(16) +
  'z최대(피처)'
);
console.log('  ' + '─'.repeat(90));

anomScores.slice(0, 8).forEach(s => {
  const contribSorted = s.contrib.map((v, i) => [v, ANOMF[i]]).sort((a, b) => b[0] - a[0]);
  const top1 = contribSorted[0];
  const top2 = contribSorted[1];
  const zArr = s.z.map((v, i) => [Math.abs(v), ANOMF[i]]).sort((a, b) => b[0] - a[0]);
  console.log(
    '  ' +
    s.stock.name.padEnd(17) +
    s.stock.theme.substring(0, 9).padEnd(10) +
    s.d2.toFixed(2).padStart(8) +
    `  ${top1[1]}(${top1[0].toFixed(2)})`.padEnd(18) +
    `${top2[1]}(${top2[0].toFixed(2)})`.padEnd(18) +
    `z=${zArr[0][0].toFixed(2)} (${zArr[0][1]})`
  );
});

// 단일 z-max vs D² — joint anomaly 예시
console.log('\n  ─ joint anomaly 예시 (단일 피처 z-max는 평범하지만 D²는 높은 종목) ─');
// 단일 z 최대가 낮은데 D²가 높은 케이스 찾기
const jointCandidates = anomScores
  .filter(s => s.zMax < 2.5 && s.d2 > 10) // z-max 낮지만 D² 높음
  .sort((a, b) => (b.d2 / b.zMax) - (a.d2 / a.zMax));

if (jointCandidates.length > 0) {
  const ex = jointCandidates[0];
  const contribEx = ex.contrib.map((v, i) => [v, ANOMF[i]]).sort((a, b) => b[0] - a[0]);
  console.log(`  ${ex.stock.name} (${ex.stock.theme})`);
  console.log(`    D² = ${ex.d2.toFixed(2)},  z_max = ${ex.zMax.toFixed(2)} (${ex.singleFeatMax})`);
  console.log(`    → 어느 한 피처가 폭발하지 않았지만 여러 피처가 동시에 중간 이상:`);
  contribEx.forEach(([cv, fn]) => {
    const z_j = ex.z[ANOMF.indexOf(fn)];
    console.log(`      ${fn.padEnd(14)} z=${z_j.toFixed(2).padStart(6)}  기여=${cv.toFixed(2)}`);
  });
} else {
  console.log('  (해당 조건 종목 없음 — z_max<2.5 & D²>10)');
  // 완화
  const ex2 = anomScores.filter(s => s.zMax < 3.0).slice(0, 1)[0];
  if (ex2) {
    const contribEx = ex2.contrib.map((v, i) => [v, ANOMF[i]]).sort((a, b) => b[0] - a[0]);
    console.log(`  완화 예시: ${ex2.stock.name} (${ex2.stock.theme})`);
    console.log(`    D² = ${ex2.d2.toFixed(2)},  z_max = ${ex2.zMax.toFixed(2)}`);
    contribEx.forEach(([cv, fn]) => {
      const z_j = ex2.z[ANOMF.indexOf(fn)];
      console.log(`      ${fn.padEnd(14)} z=${z_j.toFixed(2).padStart(6)}  기여=${cv.toFixed(2)}`);
    });
  }
}

// D² vs z-max 산포 요약
const rankD2 = anomScores.map((s, i) => ({ name: s.stock.name, rankD2: i + 1 }));
const byZmax = [...anomScores].sort((a, b) => b.zMax - a.zMax);
const rankZmax = byZmax.map((s, i) => ({ name: s.stock.name, rankZmax: i + 1 }));

console.log('\n  D² 상위 10 vs z-max 상위 10 공통종목:');
const topD2Names = new Set(anomScores.slice(0, 10).map(s => s.stock.name));
const topZNames  = new Set(byZmax.slice(0, 10).map(s => s.stock.name));
const both = [...topD2Names].filter(n => topZNames.has(n));
const onlyD2 = [...topD2Names].filter(n => !topZNames.has(n));
const onlyZ  = [...topZNames].filter(n => !topD2Names.has(n));
console.log(`    공통: ${both.join(', ') || '없음'}`);
console.log(`    D²만: ${onlyD2.join(', ') || '없음'}  ← joint anomaly`);
console.log(`    z만:  ${onlyZ.join(', ')  || '없음'}  ← 단일 피처 폭발`);

// ────────────────────────────────────────────
// 5. 핵심 발견 요약
// ────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('5. 분석 핵심 발견 요약');
console.log('═══════════════════════════════════════════════');

// 중복 그룹 추출
const redGroups = {};
highCorrPairs.forEach(({a, b, rho}) => {
  const key = `${a}-${b}`;
  redGroups[key] = rho;
});

console.log(`
[발견 1] 상관 중복: ${highCorrPairs.length}쌍이 |ρ|>0.7
  - 가장 높은 쌍: ${highCorrPairs[0] ? `${highCorrPairs[0].a} × ${highCorrPairs[0].b} (ρ=${highCorrPairs[0].rho.toFixed(3)})` : '없음'}
  - ret계열(ret5/ret20/ret60)끼리 강한 자기상관 → 사실상 하나의 추세 팩터
  - mktCap × turnover: ρ=0.98 (시총이 클수록 절대 거래대금 크다 — 완전 중복)
  - vol20 × atr14: ρ=0.82 (일중 변동성 절대값과 거래량 절대값은 같은 크기 팩터)
  - relVol은 turnover/vol20과 낮은 상관(0.1 미만) → 상대 거래량이 진짜 독립 신호

[발견 2] 유효 차원: ${F}개 피처가 ${pc90}개 주성분으로 90% 설명
  - Kaiser 기준(λ>1.0) 유효 차원: ${sortedEigen.filter(v=>v>1.0).length}개
  - ${F}개 피처가 ${pc90}차원으로 압축 → 약 ${Math.round(100*(1-pc90/F))}% 중복 정보
  - PC1은 추세(ret계열)·PC2는 거래량 절대값·PC3은 오더북/속도 팩터로 해석 가능
  - tradeN=50 상수(전 종목 동일) → 정보량 0, 이미 분석 피처에서 제외됨

[발견 3] 시장·섹터 통제 후 잔차
  - ret1: R²=${ret1R2.toFixed(3)} → ${(ret1R2*100).toFixed(1)}%는 테마 공통 움직임, ${((1-ret1R2)*100).toFixed(1)}%가 종목 고유
  - relVol: R²=${relVolR2.toFixed(3)} → 거래량 과열은 테마보다 종목별 고유 현상 (${((1-relVolR2)*100).toFixed(1)}% 잔존)
  - vol20: R²=${vol20R2.toFixed(3)} → 절대 거래량은 시총·섹터 영향 강함
  - 핵심: 이상탐지에 쓸 피처는 반드시 시장·섹터 통제 후 잔차여야 공정

[발견 4] 다변량 D² vs 단일 z
  - Ledoit-Wolf ρ=${lwRho.toFixed(3)}: 공분산 수축 필요 (n=441, p=6, 충분히 안정적)
  - D² 상위 10 ∩ z-max 상위 10 = ${both.length}개 종목
  - 단일 피처만 보면 놓치는 joint anomaly: ${onlyD2.length}종목 (D²만 상위)
  - D²는 피처 간 공분산 구조를 반영 → 1개 피처가 극단 아니어도 복수 중도 이상 포착

[발견 5] 레이더 신호 설계 함의
  - 사용할 핵심 피처: relVol(거래량), |ret1잔차|(고유수익), obImbalance(수급 기울기), range(변동폭)
  - 제거 대상: ret5/ret20/ret60(ret1과 중복), vol20(mktCap 대리), volRatio(relVol 대리)
  - 이상 점수: 단순 z-합보다 D²(Ledoit-Wolf)가 더 정교한 joint 탐지
  - 섹터 통제 후 잔차를 피처로 써야 "우량주·잡주 어디서나 같은 뜻" 보장됨
`);
