/**
 * analyze3.mjs — 교호항 검정: 차원 축소 정당성 평가
 *
 * 목적:
 *   06에서 21피처→6피처로 축소할 때 버린 "중복쌍"이 실제로 교호항(A·B)을 통해
 *   이상점수를 더 잘 설명하는가를 정식 검정.
 *   SBV fusion gain 검정의 주식판 — "상관 높다고 무가치 아님"을 반증하거나 기각.
 *
 * 검정 설계:
 *   (1) 각 중복쌍 (A,B)에 대해 가산 모형 vs 교호항 포함 모형 ΔR² 비교
 *   (2) 순열검정(permutation test)으로 ΔR² 영분포 대비 p값 계산
 *   (3) 6피처 D² vs 교호항 포함 D² 이상점수 순위 차이 — 어떤 종목이 달라지나
 *   (4) 판정: 어느 쌍을 버려도 되는지, 어느 쌍은 교호항으로 살려야 하는지
 *
 * 정직성 제약:
 *   - 단면 1개이므로 예측·알파 주장 없음 (서술적 이상탐지까지만)
 *   - 소표본 과적합 가능성 명시
 *   - 룩어헤드·누설 없음 (단면 내 자기일관성만 검정)
 *   - lev·tradeN은 죽은 컬럼이므로 제외
 */

import fs from 'fs';

// ════════════════════════════════════════════════════════════
// 0. 데이터 로드
// ════════════════════════════════════════════════════════════
const DATA_PATH = 'C:/Users/zzang/Desktop/Yoon_temp/stock/data/stock-features.json';
const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const all = Object.values(raw.features); // 441개

// 필요 피처 전부 있는 유효 종목만 (lev, tradeN 제외)
const NEED_FEATS = [
  'gap', 'range', 'body', 'relVol', 'turnover', 'vol20', 'volRatio',
  'atr14', 'ret1', 'ret5', 'ret20', 'ret60',
  'pos200', 'mktCap', 'obImbalance', 'spread', 'tradeStrength'
];

function isFinite_(v) { return typeof v === 'number' && isFinite(v); }

const stocks = all.filter(s => NEED_FEATS.every(f => isFinite_(s[f])));
const N = stocks.length;

console.log('═'.repeat(70));
console.log('analyze3.mjs — 교호항 검정: 차원 축소 정당성 평가');
console.log('═'.repeat(70));
console.log(`\n유효 종목 수: ${N} (죽은 컬럼 lev·tradeN 제외)`);

// ════════════════════════════════════════════════════════════
// 유틸 함수
// ════════════════════════════════════════════════════════════

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr, mu) {
  if (mu === undefined) mu = mean(arr);
  const v = arr.reduce((s, x) => s + (x - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  const sa = std(a, ma), sb = std(b, mb);
  if (sa < 1e-12 || sb < 1e-12) return 0;
  const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (a.length - 1);
  return cov / (sa * sb);
}

/** 배열 z-score 정규화 */
function zscore(arr) {
  const mu = mean(arr);
  const s = std(arr, mu);
  return s < 1e-12 ? arr.map(() => 0) : arr.map(v => (v - mu) / s);
}

/**
 * 다중 OLS: y = β₀ + β₁x₁ + ... + βₖxₖ + ε
 * 설계행렬 X는 이미 intercept 포함하여 전달
 * 반환: { R2, resid, beta, ssRes, ssTot }
 */
function ols(X, y) {
  const n = y.length;
  const p = X[0].length;
  // X'X
  const XtX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) =>
      X.reduce((s, r) => s + r[i] * r[j], 0)
    )
  );
  // X'y
  const Xty = Array.from({ length: p }, (_, i) =>
    X.reduce((s, r, k) => s + r[i] * y[k], 0)
  );
  // Gauss-Jordan: [XtX | Xty] → β
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let mx = col;
    for (let r = col + 1; r < p; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[mx][col])) mx = r;
    [aug[col], aug[mx]] = [aug[mx], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-12) continue; // 특이행렬 방어
    aug[col] = aug[col].map(v => v / piv);
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      aug[r] = aug[r].map((v, c) => v - f * aug[col][c]);
    }
  }
  const beta = aug.map(r => r[p]);
  const yhat = X.map(r => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = y.map((v, i) => v - yhat[i]);
  const mu = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - mu) ** 2, 0);
  const ssRes = resid.reduce((s, v) => s + v * v, 0);
  const R2 = ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
  return { R2, resid, beta, ssRes, ssTot, yhat };
}

/** Ledoit-Wolf 수축 공분산 */
function ledoitWolfCov(Z) {
  const n = Z.length, p = Z[0].length;
  const S = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) =>
      Z.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)
    )
  );
  const trS = S.reduce((s, _, i) => s + S[i][i], 0);
  const S2F = S.reduce((s, row) => s + row.reduce((t, v) => t + v * v, 0), 0);
  const mu = trS / p;
  const num = ((n - 2) / n) * S2F + trS * trS;
  const den = (n + 2) * (S2F - trS * trS / p);
  const rho = den < 1e-12 ? 0 : Math.min(1, num / den);
  const Slw = S.map((row, i) =>
    row.map((v, j) => (1 - rho) * v + (i === j ? rho * mu : 0))
  );
  return { Slw, rho };
}

/** Gauss-Jordan 역행렬 */
function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [
    ...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)
  ]);
  for (let col = 0; col < n; col++) {
    let mx = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[mx][col])) mx = r;
    [aug[col], aug[mx]] = [aug[mx], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-12) continue;
    aug[col] = aug[col].map(v => v / piv);
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      aug[r] = aug[r].map((v, c) => v - f * aug[col][c]);
    }
  }
  return aug.map(row => row.slice(n));
}

/** 마할라노비스 D²(z, Σ⁻¹) */
function mahalD2(z, Sinv) {
  let d2 = 0;
  for (let i = 0; i < z.length; i++)
    for (let j = 0; j < z.length; j++)
      d2 += z[i] * Sinv[i][j] * z[j];
  return d2;
}

/** 행렬 z-score 표준화 */
function zscoreMatrix(mat) {
  const p = mat[0].length;
  const means = Array.from({ length: p }, (_, j) => mean(mat.map(r => r[j])));
  const stds  = Array.from({ length: p }, (_, j) => std(mat.map(r => r[j]), means[j]));
  const Z = mat.map(row =>
    row.map((v, j) => stds[j] < 1e-12 ? 0 : (v - means[j]) / stds[j])
  );
  return { Z, means, stds };
}

/**
 * 테마 더미 OLS 잔차 (시장·섹터 통제)
 * y ~ intercept + 테마더미 → 잔차 반환
 */
const themes = [...new Set(stocks.map(s => s.theme))].sort();

function themeResid(y) {
  const dummies = themes.slice(1);
  const X = stocks.map(s => [1, ...dummies.map(d => s.theme === d ? 1 : 0)]);
  const { resid, R2 } = ols(X, y);
  return { resid, R2 };
}

// 기초: ret1 테마 잔차 (시장·섹터 통제 후 고유수익)
const ret1Val = stocks.map(s => s.ret1);
const { resid: ret1Resid } = themeResid(ret1Val);

/**
 * ────────────────────────────────────────────────────────
 * 순열검정(Permutation Test)
 * 귀무가설 H₀: ΔR²이 우연히 관측될 수 있다 (교호항이 타깃과 무관)
 * 방법: Y를 무작위 섞어 ΔR²_perm 분포 구성 → 관측 ΔR²의 p값 계산
 * ────────────────────────────────────────────────────────
 */
function shuffle(arr) {
  // Fisher-Yates — 원본 보존
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 교호항 검정 핵심 함수
 * @param {number[]} A   - 피처 A (표준화된)
 * @param {number[]} B   - 피처 B (표준화된)
 * @param {number[]} Y   - 종속변수 (이상점수 또는 서로의 잔차, 표준화된)
 * @param {number}   nPerm - 순열 반복수
 * @returns {object}     { R2_add, R2_inter, deltaR2, pval, se_delta, interaction_coef }
 */
function interactionTest(A, B, Y, nPerm = 2000) {
  const n = A.length;

  // (1) 가산 모형: Y ~ 1 + A + B
  const X_add = A.map((a, i) => [1, a, B[i]]);
  const { R2: R2_add } = ols(X_add, Y);

  // (2) 교호항 포함 모형: Y ~ 1 + A + B + A·B
  //     교호항 A·B를 직교화: A·B_raw - proj(A·B|A) - proj(A·B|B)
  //     → 순수 비선형 상호작용만 남김 (다중공선성 억제)
  const AB_raw = A.map((a, i) => a * B[i]);

  // A·B를 A, B에 대해 회귀 → 잔차 = 직교 교호항
  const X_for_ab = A.map((a, i) => [1, a, B[i]]);
  const { resid: AB_orth } = ols(X_for_ab, AB_raw);

  const X_inter = A.map((a, i) => [1, a, B[i], AB_orth[i]]);
  const { R2: R2_inter, beta } = ols(X_inter, Y);

  // 실제 ΔR² = 교호항 추가로 인한 설명력 증분
  const deltaR2 = R2_inter - R2_add;

  // (3) 순열검정: Y를 섞어 ΔR² 영분포 구성
  const perm_deltaR2 = [];
  for (let p = 0; p < nPerm; p++) {
    const Yp = shuffle(Y);
    const { R2: R2a_p } = ols(X_add,   Yp);
    const { R2: R2i_p } = ols(X_inter, Yp);
    perm_deltaR2.push(R2i_p - R2a_p);
  }

  // p값: 순열 분포에서 관측 ΔR² 이상의 비율
  const pval = perm_deltaR2.filter(v => v >= deltaR2).length / nPerm;

  // SE of ΔR² (순열 분포의 표준편차 — 영분포 기준)
  const se_delta = std(perm_deltaR2);

  // z-stat (순열 영분포 대비)
  const mu_perm = mean(perm_deltaR2);
  const z_stat = se_delta < 1e-12 ? 0 : (deltaR2 - mu_perm) / se_delta;

  // 교호항 계수 (직교화 후)
  const interaction_coef = beta[3]; // β₃ (AB_orth 계수)

  return {
    R2_add, R2_inter, deltaR2,
    pval, se_delta, z_stat,
    interaction_coef,
    perm_mu: mu_perm
  };
}

/**
 * 단순 OLS 잔차 (쌍 A→B)
 * B를 A로 회귀한 잔차 = "A로 설명 안 되는 B"
 */
function pairResid(A, B) {
  const X = A.map(a => [1, a]);
  const { resid, R2 } = ols(X, B);
  return { resid, R2 };
}

// ════════════════════════════════════════════════════════════
// 사전 계산: 6피처 D² (analyze.mjs의 기준 모델과 동일)
// ════════════════════════════════════════════════════════════

// 핵심 6피처 구성 (ret1은 테마 잔차 절대값 사용)
const BASE_FEATS = ['relVol', 'absRet1', 'volRatio', 'obImbalance', 'absTrStr', 'range'];
const baseMat = stocks.map((s, i) => [
  s.relVol,
  Math.abs(ret1Resid[i]),  // 시장·섹터 통제 후 절대 고유수익
  s.volRatio,
  Math.abs(s.obImbalance), // 절대값 (방향 무관 강도)
  Math.abs(s.tradeStrength),
  s.range
]);

const { Z: baseZ } = zscoreMatrix(baseMat);
const { Slw: baseSlw } = ledoitWolfCov(baseZ);
const baseSInv = invertMatrix(baseSlw);
const D2_base = baseZ.map(z => mahalD2(z, baseSInv)); // 기준 6피처 D²

console.log(`\n기준 6피처 D² 계산 완료. Ledoit-Wolf 수축 공분산 적용.`);
console.log(`(relVol, |ret1잔차|, volRatio, |obImbalance|, |tradeStrength|, range)\n`);

// D² 자체를 이상점수 "타깃"으로 사용
// (단면에 라벨 없으므로 D²가 서술적 이상강도의 대리변수)
// → 교호항이 D²를 추가 설명하면 "그 쌍은 정보를 추가함" = 버리면 안 됨
const Y_target = zscore(D2_base); // 표준화된 이상점수

// ════════════════════════════════════════════════════════════
// 1. 중복쌍 교호항 검정
// ════════════════════════════════════════════════════════════
console.log('═'.repeat(70));
console.log('1. 중복쌍 교호항 검정 (ΔR², 순열 p, SE)');
console.log('═'.repeat(70));
console.log(`\n타깃(Y): 6피처 기준 마할라노비스 D² (표준화)`);
console.log(`교호항 A·B: A,B 선형분 직교화 후 순수 비선형 상호작용만 추출`);
console.log(`순열검정: nPerm=2000, Y 섞어 ΔR² 영분포 구성\n`);

// 검정할 중복쌍 정의
// (A, B, 방향성, 설명, 버린 이유, 07의 판정)
const PAIRS = [
  {
    label: 'mktCap × turnover',
    descr: '시총 ↔ 거래대금 (ρ=0.98, 가장 강한 중복)',
    A: stocks.map(s => s.mktCap),
    B: stocks.map(s => s.turnover),
    why_dropped: '정의적 중복: 시총이 크면 거래대금도 크다',
    prev_finding: '07에서 turnover⊥mktCap 잔차를 "순수 자금유입"으로 살림'
  },
  {
    label: 'body × ret1',
    descr: '봉 몸통 ↔ 전일대비 수익률 (ρ=0.83)',
    A: ret1Val,         // ret1을 원시값으로
    B: stocks.map(s => s.body),
    why_dropped: '정의적 중복: 봉 몸통과 수익률은 같은 움직임',
    prev_finding: '07에서 body⊥ret1 잔차를 "방향성 강도 보조"로 약하게 살림'
  },
  {
    label: 'vol20 × atr14',
    descr: '20일 거래량 ↔ 14일 ATR (ρ=0.82)',
    A: stocks.map(s => s.vol20),
    B: stocks.map(s => s.atr14),
    why_dropped: '정의적 중복: 거래량 많으면 변동성도 크다',
    prev_finding: '07에서 atr14⊥vol20 잔차를 "가격이동 효율성"으로 살림'
  },
  {
    label: 'ret5 × ret20',
    descr: '5일 수익률 ↔ 20일 수익률 (ρ=0.77)',
    A: stocks.map(s => s.ret5),
    B: stocks.map(s => s.ret20),
    why_dropped: '추세 사슬: 단기↔중기 수익률 상관',
    prev_finding: '07에서 ret20⊥ret5 잔차를 "모멘텀 지속성"으로 살림 (ρ_D²=0.089)'
  },
  {
    label: 'ret5 × ret60',
    descr: '5일 수익률 ↔ 60일 수익률 (ρ=0.55~0.77 추정)',
    A: stocks.map(s => s.ret5),
    B: stocks.map(s => s.ret60),
    why_dropped: '추세 사슬: 단기↔장기 수익률 상관',
    prev_finding: '07에서 ret60⊥ret5 잔차는 ρ_D² 미확인'
  },
  {
    label: 'ret20 × ret60',
    descr: '20일 수익률 ↔ 60일 수익률 (추세 사슬)',
    A: stocks.map(s => s.ret20),
    B: stocks.map(s => s.ret60),
    why_dropped: '추세 사슬: 중기↔장기 수익률 상관',
    prev_finding: '07에서 미검정'
  }
];

console.log('각 쌍의 피처는 z-score 표준화 후 교호항 검정.\n');
console.log('─'.repeat(70));

// 랜덤 시드 고정 불가(Node 내장 없음) → 재현성 위해 순열수 2000으로 충분히 큼

const interactionResults = [];

for (const pair of PAIRS) {
  // 표준화
  const zA = zscore(pair.A);
  const zB = zscore(pair.B);

  // 교호항 검정: 타깃 = D² (서술적 이상강도)
  const res = interactionTest(zA, zB, Y_target, 2000);

  // 추가: 쌍끼리 서로의 잔차를 타깃으로 삼는 검정
  // (B를 A로 설명할 때 교호항이 잔차를 줄이나 — 순수 구조 검정)
  const { resid: residB_A } = pairResid(zA, zB);
  const residTarget = zscore(residB_A.map(Math.abs)); // |잔차| 표준화
  const res_cross = interactionTest(zA, zB, residTarget, 1000);

  // 단순 피어슨: 잔차 vs D²
  const { resid: rawResid } = pairResid(pair.A, pair.B);
  const rho_resid_D2 = pearson(rawResid.map(Math.abs), D2_base);

  // 결과 저장
  interactionResults.push({
    ...pair,
    zA, zB,
    rawResid,
    rho_resid_D2,
    main: res,      // 타깃: D²
    cross: res_cross // 타깃: 잔차 절대값
  });

  // 출력
  const sig = res.pval < 0.05 ? ' *** 유의' : (res.pval < 0.10 ? ' * 경계' : ' (무의미)');
  console.log(`\n[쌍] ${pair.label}`);
  console.log(`  설명: ${pair.descr}`);
  console.log(`  버린 이유: ${pair.why_dropped}`);
  console.log(`  07 사전 판정: ${pair.prev_finding}`);
  console.log(`  ─ 교호항 검정 결과 (타깃=D²이상점수) ─`);
  console.log(`  가산 모형   R²   = ${res.R2_add.toFixed(5)}`);
  console.log(`  교호항 모형 R²   = ${res.R2_inter.toFixed(5)}`);
  console.log(`  ΔR²              = ${res.deltaR2.toFixed(6)}${sig}`);
  console.log(`  순열 p           = ${res.pval.toFixed(4)}  (영분포 μ=${res.perm_mu.toFixed(6)}, SE=${res.se_delta.toFixed(6)})`);
  console.log(`  순열 z-stat      = ${res.z_stat.toFixed(2)}`);
  console.log(`  교호항 계수 β₃   = ${res.interaction_coef.toFixed(6)}`);
  console.log(`  잔차 ↔ D² ρ      = ${rho_resid_D2.toFixed(4)}`);
}

// ════════════════════════════════════════════════════════════
// 2. 교호항 D² vs 기준 6피처 D² — 순위 차이 비교
// ════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('2. 교호항 D² vs 기준 6피처 D² — 이상점수 순위 비교');
console.log('═'.repeat(70));

/**
 * "교호항 포함 확장 피처셋"을 구성하는 전략:
 *   - 유의한 쌍의 직교화 교호항만 추가 (불필요한 차원 팽창 방지)
 *   - 기준: 순열 p < 0.05 OR ρ_resid_D2 > 0.10 (이상탐지 기여 확인)
 *
 * 세 가지 피처셋 비교:
 *   A: 기존 6피처 (D2_base)
 *   B: 기존 6피처 + 유의한 교호항들 (AB_orth 추가)
 *   C: 기존 6피처 + 07에서 살린 잔차 2개(turnover⊥mktCap, ret20⊥ret5)
 *      + 유의한 교호항들 (가장 풍부한 모델)
 */

// 직교 교호항 생성 (유의 여부와 무관하게 전부 계산)
const orthoTerms = interactionResults.map(r => {
  const AB_raw = r.zA.map((a, i) => a * r.zB[i]);
  const X_ab   = r.zA.map((a, i) => [1, a, r.zB[i]]);
  const { resid: AB_orth } = ols(X_ab, AB_raw);
  return { label: r.label, AB_orth, pval: r.main.pval, rho: r.rho_resid_D2 };
});

// 유의한 교호항 필터 (p<0.05 OR ρ>0.10)
const sigTerms = orthoTerms.filter(t => t.pval < 0.05 || Math.abs(t.rho) > 0.10);
console.log(`\n유의 교호항 (p<0.05 OR ρ_D²>0.10): ${sigTerms.length}개`);
sigTerms.forEach(t => console.log(`  - ${t.label}  (p=${t.pval.toFixed(4)}, ρ_D²=${t.rho.toFixed(4)})`));

// 피처셋 A: 기존 6 (D2_base)
// 피처셋 B: 기존 6 + 유의 교호항
// 피처셋 C: 기존 6 + 07 잔차 2개 + 유의 교호항

// 07 잔차: turnover ⊥ mktCap, ret20 ⊥ ret5
const { resid: res_to_cap }      = pairResid(stocks.map(s => s.mktCap), stocks.map(s => s.turnover));
const { resid: res_ret20_ret5 }  = pairResid(stocks.map(s => s.ret5),   stocks.map(s => s.ret20));

// 피처셋 B
function buildD2(featureCols) {
  // featureCols: 각 열이 N 길이 배열
  const mat = stocks.map((_, i) => featureCols.map(col => col[i]));
  const { Z } = zscoreMatrix(mat);
  const { Slw } = ledoitWolfCov(Z);
  const Sinv = invertMatrix(Slw);
  return Z.map(z => mahalD2(z, Sinv));
}

// A피처 열 (기존 6)
const colsA = [
  baseMat.map(r => r[0]), // relVol
  baseMat.map(r => r[1]), // absRet1
  baseMat.map(r => r[2]), // volRatio
  baseMat.map(r => r[3]), // obImbalance
  baseMat.map(r => r[4]), // absTrStr
  baseMat.map(r => r[5])  // range
];

// B피처 열 (기존 6 + 유의 교호항)
const colsB = [
  ...colsA,
  ...sigTerms.map(t => t.AB_orth)
];

// C피처 열 (기존 6 + 07 잔차 2개 + 유의 교호항)
const colsC = [
  ...colsA,
  res_to_cap,     // turnover ⊥ mktCap
  res_ret20_ret5, // ret20 ⊥ ret5
  ...sigTerms.map(t => t.AB_orth)
];

const D2_A = D2_base; // 이미 계산됨
const D2_B = buildD2(colsB);
const D2_C = buildD2(colsC);

console.log(`\n피처셋 A (기존 6피처):      D² 계산 완료`);
console.log(`피처셋 B (기존 6 + 유의교호항 ${sigTerms.length}개): D² 계산 완료`);
console.log(`피처셋 C (B + 07 잔차 2개):  D² 계산 완료`);

// 피처셋 간 순위 비교
function rankArr(arr) {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const ranks = new Array(arr.length);
  indexed.forEach((x, r) => { ranks[x.i] = r + 1; });
  return ranks;
}

const rankA = rankArr(D2_A);
const rankB = rankArr(D2_B);
const rankC = rankArr(D2_C);

// A↔B, A↔C 순위 변화가 가장 큰 종목
const rankDiff_AB = stocks.map((s, i) => ({
  name: s.name, theme: s.theme,
  rA: rankA[i], rB: rankB[i], rC: rankC[i],
  dAB: rankA[i] - rankB[i], // 양수: B에서 더 위로
  dAC: rankA[i] - rankC[i]
}));

// 순위 스피어만 상관 (A-B, A-C)
const rho_AB = pearson(rankA, rankB);
const rho_AC = pearson(rankA, rankC);
console.log(`\n순위 스피어만 상관 (피어슨 근사):`);
console.log(`  A ↔ B : ρ = ${rho_AB.toFixed(4)}  (1에 가까울수록 교호항 추가가 순위 안 바꿈)`);
console.log(`  A ↔ C : ρ = ${rho_AC.toFixed(4)}`);

// A→B 순위 가장 많이 오른 종목 (교호항 추가로 새로 포착된 종목)
const risers_AB = [...rankDiff_AB].sort((a, b) => b.dAB - a.dAB).filter(r => r.dAB > 0);
const fallers_AB = [...rankDiff_AB].sort((a, b) => a.dAB - b.dAB).filter(r => r.dAB < 0);

console.log(`\nA→B 순위 가장 많이 오른 종목 (교호항 추가로 새로 포착):`);
risers_AB.slice(0, 8).forEach(r => {
  console.log(`  ${r.name.padEnd(16)} (${r.theme.padEnd(8)})  A위=${r.rA} → B위=${r.rB}  (↑${r.dAB}위)`);
});

console.log(`\nA→B 순위 가장 많이 떨어진 종목 (교호항 추가 시 상대적으로 덜 이상):`);
fallers_AB.slice(0, 8).forEach(r => {
  console.log(`  ${r.name.padEnd(16)} (${r.theme.padEnd(8)})  A위=${r.rA} → B위=${r.rB}  (↓${Math.abs(r.dAB)}위)`);
});

// A→C 비교 (가장 풍부한 모델)
const risers_AC = [...rankDiff_AB].sort((a, b) => b.dAC - a.dAC).filter(r => r.dAC > 0);
console.log(`\nA→C 순위 가장 많이 오른 종목 (교호항+07잔차 모두 추가 시):`);
risers_AC.slice(0, 8).forEach(r => {
  console.log(`  ${r.name.padEnd(16)} (${r.theme.padEnd(8)})  A위=${r.rA} → C위=${r.rC}  (↑${r.dAC}위)`);
});

// ════════════════════════════════════════════════════════════
// 3. 6피처 D²와 교호항 D²의 이상탐지 범위 비교
// ════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('3. 6피처 D² 상위 vs 교호항 D² 상위 — 새로 포착되는 종목');
console.log('═'.repeat(70));

const TOP_K = 20;
const topA_set = new Set(rankDiff_AB.filter(r => r.rA <= TOP_K).map(r => r.name));
const topB_set = new Set(rankDiff_AB.filter(r => r.rB <= TOP_K).map(r => r.name));
const topC_set = new Set(rankDiff_AB.filter(r => r.rC <= TOP_K).map(r => r.name));

const onlyA  = [...topA_set].filter(n => !topB_set.has(n));
const onlyB  = [...topB_set].filter(n => !topA_set.has(n)); // 교호항으로 새로 진입
const both_AB = [...topA_set].filter(n => topB_set.has(n));

const onlyC  = [...topC_set].filter(n => !topA_set.has(n)); // C모델로 새로 진입
const both_AC = [...topA_set].filter(n => topC_set.has(n));

console.log(`\nTOP${TOP_K} 비교:`);
console.log(`  A(6피처)와 B(+교호항) 공통: ${both_AB.length}종목`);
console.log(`    → ${both_AB.join(', ')}`);
console.log(`  A에만 있음 (B에서 밀려남): ${onlyA.length}종목`);
console.log(`    → ${onlyA.join(', ')}`);
console.log(`  B에만 있음 (교호항이 새로 포착): ${onlyB.length}종목`);
console.log(`    → ${onlyB.join(', ')}`);

console.log(`\n  A(6피처)와 C(+교호항+07잔차) 공통: ${both_AC.length}종목`);
console.log(`    → ${both_AC.join(', ')}`);
console.log(`  C에만 있음 (가장 풍부한 모델이 새로 포착): ${onlyC.length}종목`);
console.log(`    → ${onlyC.join(', ')}`);

// 새로 포착된 종목의 상세 피처 프로파일
if (onlyB.length > 0) {
  console.log(`\n교호항 모델(B)이 새로 포착한 종목 상세:`);
  onlyB.slice(0, 5).forEach(name => {
    const idx = stocks.findIndex(s => s.name === name);
    if (idx < 0) return;
    const s = stocks[idx];
    const z = baseZ[idx];
    const zNames = ['relVol','absRet1','volRatio','obImbalance','absTrStr','range'];
    console.log(`\n  ${name} (${s.theme})  A위=${rankDiff_AB[idx].rA}→B위=${rankDiff_AB[idx].rB}`);
    console.log(`    D²_A=${D2_A[idx].toFixed(2)}  D²_B=${D2_B[idx].toFixed(2)}`);
    zNames.forEach((fn, j) => {
      const bar = '▓'.repeat(Math.min(10, Math.round(Math.abs(z[j]))));
      console.log(`    ${fn.padEnd(13)} z=${(z[j]>=0?'+':'')}${z[j].toFixed(2).padStart(5)}  ${bar}`);
    });
  });
}

// ════════════════════════════════════════════════════════════
// 4. 소표본 강건성 — 부트스트랩 SE
// ════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('4. 소표본 강건성 — 부트스트랩 SE (nBoot=500, 복원추출)');
console.log('═'.repeat(70));

console.log(`\n경고: N=${N} 단면 1개, p/N 낮아도 교호항 수 증가 시 과적합 위험.`);
console.log(`부트스트랩은 ΔR²의 표본 변동성을 추정. CI 넓으면 단면 1개 결과 신뢰 낮음.\n`);

const N_BOOT = 500;

// 유의한 쌍에 대해서만 부트스트랩 (연산 절약)
const sigPairs = interactionResults.filter(r => r.main.pval < 0.05 || Math.abs(r.rho_resid_D2) > 0.10);

for (const pair of sigPairs) {
  const zA = pair.zA;
  const zB = pair.zB;

  const boot_deltaR2 = [];
  for (let b = 0; b < N_BOOT; b++) {
    // 복원추출 인덱스
    const idxSample = Array.from({ length: N }, () => Math.floor(Math.random() * N));
    const yS  = idxSample.map(i => Y_target[i]);
    const zaS = idxSample.map(i => zA[i]);
    const zbS = idxSample.map(i => zB[i]);

    // 가산 모형
    const Xa = zaS.map((a, i) => [1, a, zbS[i]]);
    const { R2: R2a } = ols(Xa, yS);

    // 교호항
    const AB_raw = zaS.map((a, i) => a * zbS[i]);
    const { resid: AB_orth_b } = ols(Xa, AB_raw);
    const Xi = zaS.map((a, i) => [1, a, zbS[i], AB_orth_b[i]]);
    const { R2: R2i } = ols(Xi, yS);

    boot_deltaR2.push(R2i - R2a);
  }

  const mu_boot = mean(boot_deltaR2);
  const se_boot = std(boot_deltaR2, mu_boot);
  // 95% CI (백분위 방법)
  const sorted_boot = [...boot_deltaR2].sort((a, b) => a - b);
  const ci_lo = sorted_boot[Math.floor(0.025 * N_BOOT)];
  const ci_hi = sorted_boot[Math.floor(0.975 * N_BOOT)];

  console.log(`[${pair.label}]`);
  console.log(`  관측 ΔR² = ${pair.main.deltaR2.toFixed(6)}  (순열 p=${pair.main.pval.toFixed(4)})`);
  console.log(`  부트스트랩 μ_ΔR² = ${mu_boot.toFixed(6)}`);
  console.log(`  부트스트랩 SE   = ${se_boot.toFixed(6)}`);
  console.log(`  95% CI           = [${ci_lo.toFixed(6)}, ${ci_hi.toFixed(6)}]`);
  const ci_covers_zero = ci_lo <= 0 && ci_hi >= 0;
  console.log(`  CI가 0 포함?    ${ci_covers_zero ? '예 → 불안정 (단면 과적합 의심)' : '아니오 → 강건'}\n`);
}

// ════════════════════════════════════════════════════════════
// 5. 07과의 일관성 확인
// ════════════════════════════════════════════════════════════
console.log('═'.repeat(70));
console.log('5. 07에서 살린 신호와의 일관성 확인');
console.log('═'.repeat(70));

// 07에서 명시적으로 살린 두 신호:
// (1) turnover ⊥ mktCap: SK하이닉스 z=+13.65, 삼성전자 z=-12.81
// (2) ret20 ⊥ ret5: 신세계·SK하이닉스·삼성전기가 상위로

// 각 신호의 z-score 분포 + 극단 종목 확인
console.log('\n[신호 1] turnover ⊥ mktCap 잔차 (순수 자금유입)');
const zResid_to_cap = zscore(res_to_cap);
const topToCapUp = stocks.map((s, i) => ({ name: s.name, theme: s.theme, z: zResid_to_cap[i] }))
  .sort((a, b) => b.z - a.z);
console.log('  상위 5 (시총 대비 거래 폭증):');
topToCapUp.slice(0, 5).forEach(x =>
  console.log(`    ${x.name.padEnd(16)} (${x.theme})  z=+${x.z.toFixed(2)}`)
);
console.log('  하위 5 (시총 1위인데 거래 부족):');
topToCapUp.slice(-5).reverse().forEach(x =>
  console.log(`    ${x.name.padEnd(16)} (${x.theme})  z=${x.z.toFixed(2)}`)
);
const rho_to_cap_D2 = pearson(res_to_cap.map(Math.abs), D2_base);
console.log(`  |잔차| ↔ D² ρ = ${rho_to_cap_D2.toFixed(4)}`);

console.log('\n[신호 2] ret20 ⊥ ret5 잔차 (모멘텀 지속성)');
const zResid_ret20 = zscore(res_ret20_ret5);
const topRetMom = stocks.map((s, i) => ({ name: s.name, theme: s.theme, z: zResid_ret20[i] }))
  .sort((a, b) => b.z - a.z);
console.log('  상위 5 (단기보다 중기가 강한 종목):');
topRetMom.slice(0, 5).forEach(x =>
  console.log(`    ${x.name.padEnd(16)} (${x.theme})  z=+${x.z.toFixed(2)}`)
);
const rho_ret20_D2 = pearson(res_ret20_ret5.map(Math.abs), D2_base);
console.log(`  |잔차| ↔ D² ρ = ${rho_ret20_D2.toFixed(4)}`);

// 교호항 검정 결과와의 일관성
const mktCap_result  = interactionResults.find(r => r.label === 'mktCap × turnover');
const ret5ret20_result = interactionResults.find(r => r.label === 'ret5 × ret20');

console.log('\n[교호항 검정과 07 잔차 신호의 일관성]');
console.log(`  mktCap × turnover 교호항 p = ${mktCap_result?.main.pval.toFixed(4)}`);
console.log(`  → 07의 잔차 신호: ρ_D² = ${rho_to_cap_D2.toFixed(4)}`);
console.log(`  해석: 교호항이 유의${mktCap_result?.main.pval < 0.05 ? '하면' : '하지 않으면'} ρ_D² 신호와 일관적`);

console.log(`\n  ret5 × ret20 교호항 p = ${ret5ret20_result?.main.pval.toFixed(4)}`);
console.log(`  → 07의 잔차 신호: ρ_D² = ${rho_ret20_D2.toFixed(4)}`);
console.log(`  해석: 교호항이 유의${ret5ret20_result?.main.pval < 0.05 ? '하면' : '하지 않으면'} ρ_D² 신호와 일관적`);

// ════════════════════════════════════════════════════════════
// 6. 최종 판정 요약
// ════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('6. 최종 판정 요약');
console.log('═'.repeat(70));

console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  중복쌍별 최종 판정                                               │
├──────────────────────┬─────────┬──────────┬─────────────────────┤
│  쌍                  │ ΔR²     │ perm-p   │ 판정                │
├──────────────────────┼─────────┼──────────┼─────────────────────┤`);

for (const r of interactionResults) {
  const dR = r.main.deltaR2.toFixed(5).padStart(8);
  const p  = r.main.pval.toFixed(4).padStart(9);
  let verdict = '';
  if (r.main.pval < 0.05) {
    verdict = '교호항 복원 필요 ***';
  } else if (r.main.pval < 0.10 || Math.abs(r.rho_resid_D2) > 0.10) {
    verdict = '잔차 신호 유지 *';
  } else {
    verdict = '버려도 정당 (중복)';
  }
  const label = r.label.padEnd(20);
  console.log(`│  ${label}  │${dR}  │${p}  │ ${verdict.padEnd(20)}│`);
}

console.log(`└──────────────────────┴─────────┴──────────┴─────────────────────┘`);

console.log(`
─────────────────────────────────────────────────────────────────
소표본 과적합 경고:
  N=${N}, 단면 1개. 순열 p는 이 단면에서의 구조적 일관성이지
  시계열 예측력이 아님. ΔR²가 작으면(<0.01) 과적합 가능성 높음.
  부트스트랩 CI가 0 포함 → 불안정.

정직성 제약:
  - 타깃 = D² (서술적 이상강도 대리변수, 라벨 아님)
  - 예측·알파·백테스트 주장 없음
  - "단면에서 교호항이 이상 서술을 개선하나"까지만

참조 수치 (07 잔차 신호):
  turnover⊥mktCap ρ_D²  = ${rho_to_cap_D2.toFixed(4)}
  ret20⊥ret5      ρ_D²  = ${rho_ret20_D2.toFixed(4)}
─────────────────────────────────────────────────────────────────
`);

console.log('\n[최종 한 줄 판정]');
// 유의 교호항 수로 자동 판정문 생성
const sigCount = interactionResults.filter(r => r.main.pval < 0.05).length;
const margCount = interactionResults.filter(r => r.main.pval >= 0.05 && r.main.pval < 0.10).length;
const rhoSigCount = interactionResults.filter(r => Math.abs(r.rho_resid_D2) > 0.10).length;

console.log(`  유의 교호항(p<0.05): ${sigCount}쌍 / 경계(p<0.10): ${margCount}쌍 / ρ_D²>0.10: ${rhoSigCount}쌍`);

// 결과는 result-interaction.md에 저장 (이하 별도 파일로)
console.log('\nall done. 위 수치를 result-interaction.md에 정리 중...\n');
