/**
 * backtest.mjs — SBV 신호 정직 백테스트
 *
 * 데이터: data/stock-panel.json  441종목 × 140거래일
 * cols = [relVol,ret1,ret5,ret20,vol20,atr14,body,gap,range,turnover,close]
 *
 * 설계 원칙:
 *   - 신호 t시점, 타깃 t+k: 룩어헤드 완전 차단
 *   - 단면 표준화 (robust z) → 종목간 비교 가능
 *   - 다중검정 경고 명시 (Bonferroni)
 *   - 거래비용 차감 전후 모두 보고
 *   - "관측 지속성"과 "거래가능 알파" 구분
 *
 * 누설 자가점검: rows[t]는 t날짜까지 과거값만으로 산출됨(패널 생성시 보장).
 *               fwd return은 close[t+k]를 사용, 신호 산출에는 close[t]까지만 접근.
 *               교호항·잔차도 모두 단면 t의 값만 사용. 누설 없음.
 */

import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────
// 0. 상수 / 파라미터
// ─────────────────────────────────────────────────────────
const DATA_PATH    = 'C:/Users/zzang/Desktop/Yoon_temp/stock/data/stock-panel.json';
const OUT_DIR      = 'C:/Users/zzang/Desktop/Yoon_temp/stock/sbv-feasibility/prototype';
const OUT_MD       = path.join(OUT_DIR, 'result-backtest.md');

const TC_BPS_LOW   = 40;   // 왕복 거래비용 하한(bp) — 한국 개미 추정
const TC_BPS_HIGH  = 60;   // 왕복 거래비용 상한(bp)
const QUANTILE_LO  = 0.10; // 하위 10%
const QUANTILE_HI  = 0.90; // 상위 10%
const HORIZONS     = [1, 5, 20]; // forward return 기간(거래일)

// 마할라노비스 피처 셋 (col 인덱스 — relVol,ret1,ret5,ret20,body,range)
// vol20·atr14는 서로 중복(ρ=0.82), turnover는 mktCap과 중복(ρ≈0.98) → 잔차로 대체
const MAHAL_COLS   = ['relVol','ret1','ret5','ret20','body','range'];

// Ledoit-Wolf 수축 대상 같음
const LW_SHRINK    = true;  // Ledoit-Wolf 공분산 수축 사용

// ─────────────────────────────────────────────────────────
// 1. 데이터 로드
// ─────────────────────────────────────────────────────────
const raw  = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const COLS = raw.cols; // ['relVol','ret1','ret5','ret20','vol20','atr14','body','gap','range','turnover','close']
const COL  = {};
COLS.forEach((c,i) => COL[c] = i);

const panel  = raw.panel;       // { [code]: {code,name,theme,mktCap,dates[140],rows[140]} }
const stocks = Object.values(panel);
const N      = stocks.length;   // 441
const T      = stocks[0].dates.length; // 140
const DATES  = stocks[0].dates;

console.log(`종목 수: ${N}, 거래일: ${T}, 기간: ${DATES[0]} ~ ${DATES[T-1]}`);

// ─────────────────────────────────────────────────────────
// 2. 수학 유틸
// ─────────────────────────────────────────────────────────

/** 배열 중위수 */
function median(arr) {
  const s = [...arr].filter(v => isFinite(v)).sort((a,b)=>a-b);
  if (!s.length) return 0;
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

/** 배열 MAD (중위절대편차) */
function mad(arr, med) {
  if (med === undefined) med = median(arr);
  return median(arr.filter(v=>isFinite(v)).map(v=>Math.abs(v-med)));
}

/**
 * Robust z-score (median/MAD 기반) — 단면 표준화
 * scale = 1.4826*MAD ≈ 정규분포 σ 추정
 * 분모=0 방지: sigma < 1e-10이면 0 반환
 * winsorize±5σ
 */
function robustZ(arr) {
  const valid = arr.filter(v => isFinite(v) && v !== null);
  const med = median(valid);
  const sigma = 1.4826 * mad(valid, med);
  return arr.map(v => {
    if (!isFinite(v)) return 0;
    if (sigma < 1e-10) return 0;
    const z = (v - med) / sigma;
    return Math.max(-5, Math.min(5, z)); // winsorize
  });
}

/** 스피어만 상관 (배열 쌍) */
function spearman(x, y) {
  const n = x.length;
  if (n < 5) return NaN;
  // 순위 산출
  function rank(a) {
    const idx = a.map((_,i)=>i).sort((i,j)=>a[i]-a[j]);
    const r = new Array(n);
    for (let i=0; i<n; i++) r[idx[i]] = i+1;
    return r;
  }
  const rx = rank(x), ry = rank(y);
  let sumD2 = 0;
  for (let i=0; i<n; i++) sumD2 += (rx[i]-ry[i])**2;
  return 1 - 6*sumD2 / (n*(n*n-1));
}

/** 평균, 표준편차 */
function mean(arr) {
  const v = arr.filter(isFinite);
  return v.reduce((s,x)=>s+x,0)/v.length;
}
function std(arr, m) {
  const v = arr.filter(isFinite);
  if (m===undefined) m = mean(v);
  return Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1||1));
}

/** t 통계량 = mean(ic) / (std(ic)/sqrt(n)) */
function tStat(ics) {
  const v = ics.filter(isFinite);
  if (v.length < 3) return NaN;
  const m = mean(v), s = std(v, m);
  return m / (s / Math.sqrt(v.length));
}

/**
 * 단면에서 OLS 잔차 — y를 x1,x2,... 으로 회귀 후 잔차 반환
 * (절편 포함 단순 다중선형회귀)
 * 작은 N에서 안정성을 위해 Gram-Schmidt 정규화
 */
function olsResiduals(y, ...xs) {
  const n = y.length;
  // 각 x에서 평균 제거
  const design = [[...Array(n)].map(()=>1), ...xs.map(x => {
    const m = mean(x); return x.map(v=>v-m);
  })];
  // 최소제곱: (X'X)^-1 X'y — p≤3이므로 직접 계산
  // p=1+|xs| cols
  const p = design.length;
  // X: n×p (rows=observations, cols=predictors)
  const X = [];
  for (let i=0; i<n; i++) {
    X.push(design.map(col=>col[i]));
  }
  // X'X (p×p)
  const XtX = [];
  for (let a=0; a<p; a++) {
    XtX.push([]);
    for (let b=0; b<p; b++) {
      let s=0; for (let i=0; i<n; i++) s+=X[i][a]*X[i][b];
      XtX[a].push(s);
    }
  }
  // X'y (p×1)
  const Xty = [];
  for (let a=0; a<p; a++) {
    let s=0; for (let i=0; i<n; i++) s+=X[i][a]*y[i];
    Xty.push(s);
  }
  // (X'X)^-1 — p≤3이므로 Gauss-Jordan
  const beta = solveLinear(XtX, Xty, p);
  if (!beta) return y.map(()=>0); // 역행렬 실패시 0 잔차
  // 잔차
  return y.map((yi, i) => {
    let pred = 0;
    for (let a=0; a<p; a++) pred += beta[a]*X[i][a];
    return yi - pred;
  });
}

/** Gauss-Jordan 선형방정식 풀이 (p≤4 전용) */
function solveLinear(A, b, p) {
  // 확대행렬 복사
  const M = A.map((row,i) => [...row, b[i]]);
  for (let col=0; col<p; col++) {
    // 피벗 선택
    let maxRow = col;
    for (let r=col+1; r<p; r++) if (Math.abs(M[r][col])>Math.abs(M[maxRow][col])) maxRow=r;
    [M[col],M[maxRow]]=[M[maxRow],M[col]];
    const piv = M[col][col];
    if (Math.abs(piv)<1e-12) return null; // 특이행렬
    for (let r=0; r<p; r++) {
      if (r===col) continue;
      const f = M[r][col]/piv;
      for (let c=col; c<=p; c++) M[r][c] -= f*M[col][c];
    }
    for (let c=col; c<=p; c++) M[col][c]/=piv;
  }
  return M.map(row=>row[p]);
}

/**
 * Ledoit-Wolf 수축 공분산 (분석적 근사 — 단순 대각 수축)
 * α = trace(S^2)/trace(S)^2 * (n/(n-1))  → 클리핑 [0,1]
 * Σ_shrunk = (1-α)*S + α*μI, μ = trace(S)/p
 */
function ledoitWolfShrink(S, n, p) {
  // trace(S), trace(S^2)
  let trS=0, trS2=0;
  for (let i=0; i<p; i++) {
    trS += S[i][i];
    for (let j=0; j<p; j++) trS2 += S[i][j]*S[i][j];
  }
  const mu = trS/p;
  // analytical shrinkage intensity
  const rho = Math.max(0, Math.min(1, (trS2 + trS*trS) / ((n+1-2/p)*(trS2 - trS*trS/p))));
  const alpha = Math.max(0, Math.min(1, rho));
  const Shat = S.map((row,i) => row.map((v,j) => (1-alpha)*v + (i===j ? alpha*mu : 0)));
  return Shat;
}

/**
 * 표본 공분산 행렬 (p×p)
 * X: n×p 2D array (이미 평균 제거됨을 가정)
 */
function covMatrix(X, n, p) {
  const S = [];
  for (let a=0; a<p; a++) {
    S.push([]);
    for (let b=0; b<p; b++) {
      let s=0; for (let i=0; i<n; i++) s+=X[i][a]*X[i][b];
      S[a].push(s/(n-1));
    }
  }
  return S;
}

/**
 * p×p 행렬 역행렬 (Gauss-Jordan, p≤8)
 */
function matInv(A, p) {
  const M = A.map((row,i) => {
    const aug = [...row, ...Array(p).fill(0)];
    aug[p+i] = 1;
    return aug;
  });
  for (let col=0; col<p; col++) {
    let maxRow=col;
    for (let r=col+1; r<p; r++) if (Math.abs(M[r][col])>Math.abs(M[maxRow][col])) maxRow=r;
    [M[col],M[maxRow]]=[M[maxRow],M[col]];
    const piv=M[col][col];
    if (Math.abs(piv)<1e-12) return null;
    for (let c=0; c<2*p; c++) M[col][c]/=piv;
    for (let r=0; r<p; r++) {
      if (r===col) continue;
      const f=M[r][col];
      for (let c=0; c<2*p; c++) M[r][c]-=f*M[col][c];
    }
  }
  return M.map(row=>row.slice(p));
}

/**
 * 마할라노비스 D² = z' * Σ^-1 * z
 * @param z  p-벡터 (이미 표준화됨)
 * @param Si Σ^-1 (p×p)
 */
function mahal(z, Si, p) {
  let result=0;
  for (let a=0; a<p; a++) for (let b=0; b<p; b++) result+=z[a]*Si[a][b]*z[b];
  return Math.max(0, result);
}

/**
 * 섹터 더미 OLS 잔차 (단면)
 * y_i - (섹터 평균)_i
 */
function sectorNeutralResidual(y, themes) {
  const themeMeans = {};
  const themeCounts = {};
  for (let i=0; i<y.length; i++) {
    const th = themes[i];
    if (!themeMeans[th]) { themeMeans[th]=0; themeCounts[th]=0; }
    themeMeans[th]+=y[i]; themeCounts[th]++;
  }
  for (const th of Object.keys(themeMeans)) themeMeans[th]/=themeCounts[th];
  return y.map((v,i) => v - themeMeans[themes[i]]);
}

// ─────────────────────────────────────────────────────────
// 3. 패널 구성 — 날짜별 단면 추출
// ─────────────────────────────────────────────────────────

/**
 * 날짜 t에서 모든 종목의 단면 데이터 반환
 * {codes, names, themes, mktCaps, featureMatrix[N × 11], closeT, closeNext[k]}
 * 룩어헤드 차단: signal = featureMatrix[t], target = close[t+k] 별도 추출
 */
function getCrossSection(t) {
  const codes=[], names=[], themes=[], mktCaps=[];
  const signals=[]; // N × 11
  const closeT=[];  // close at t
  // forward close at t+k (k=1,5,20) — null if out of range
  const fwdClose = {1:[], 5:[], 20:[]};

  for (const s of stocks) {
    if (!s.rows[t] || s.rows[t].length < 11) continue;
    codes.push(s.code);
    names.push(s.name);
    themes.push(s.theme);
    mktCaps.push(s.mktCap);
    signals.push(s.rows[t]); // 신호: t시점 과거 값
    closeT.push(s.rows[t][COL.close]);
    for (const k of HORIZONS) {
      const tk = t+k;
      if (tk < T && s.rows[tk]) {
        fwdClose[k].push(s.rows[tk][COL.close]);
      } else {
        fwdClose[k].push(null);
      }
    }
  }
  return {codes, names, themes, mktCaps, signals, closeT, fwdClose, n: codes.length};
}

/** forward return = (close[t+k]-close[t]) / close[t] */
function calcFwdReturn(closeT, fwdCloseK) {
  return closeT.map((c0,i) => {
    const c1 = fwdCloseK[i];
    if (c1===null || !isFinite(c0) || c0===0) return null;
    return (c1-c0)/c0;
  });
}

// ─────────────────────────────────────────────────────────
// 4. 신호 산출 함수 (각각 t 단면)
// ─────────────────────────────────────────────────────────

/**
 * 단일 피처 robust z (단면 표준화)
 * 검정 피처: relVol, ret1, ret5, ret20, vol20, body, turnover, range
 */
const SINGLE_FEATURES = ['relVol','ret1','ret5','ret20','vol20','body','turnover','range'];

function singleFeatureSignals(cs) {
  const result = {};
  for (const feat of SINGLE_FEATURES) {
    const raw = cs.signals.map(row => row[COL[feat]]);
    result[feat] = robustZ(raw);
  }
  return result;
}

/**
 * 고유 잔차 신호
 * (a) ret1_resid: ret1 을 시장(전체평균) + 섹터(테마) 통제 후 잔차
 * (b) turnoverPerp: turnover ⊥ mktCap (mktCap 선형 제거)
 * (c) momPersist: ret20 ⊥ ret5 (단기 모멘텀 선형 제거 → 중기 고유 모멘텀)
 */
function residualSignals(cs) {
  const ret1    = cs.signals.map(r=>r[COL.ret1]);
  const ret5    = cs.signals.map(r=>r[COL.ret5]);
  const ret20   = cs.signals.map(r=>r[COL.ret20]);
  const turnover= cs.signals.map(r=>r[COL.turnover]);
  const mktCap  = cs.mktCaps.map(v => isFinite(v) ? v : 0);

  // (a) ret1 잔차: 섹터 더미 통제(시장평균 포함)
  const ret1_mkt = mean(ret1.filter(isFinite));
  const ret1_demeaned = ret1.map(v=>v-ret1_mkt);
  const ret1_resid_raw = sectorNeutralResidual(ret1_demeaned, cs.themes);
  const ret1_resid = robustZ(ret1_resid_raw);

  // (b) turnover ⊥ mktCap: mktCap 선형 회귀 후 잔차
  const turnoverPerp_raw = olsResiduals(turnover, mktCap);
  const turnoverPerp = robustZ(turnoverPerp_raw);

  // (c) ret20 ⊥ ret5: ret5 선형 회귀 후 잔차
  const momPersist_raw = olsResiduals(ret20, ret5);
  const momPersist = robustZ(momPersist_raw);

  return {ret1_resid, turnoverPerp, momPersist};
}

/**
 * 교호항 신호 (직교화)
 * (a) body × ret1: body와 ret1 각각 robust z 후 곱 → 동조강도
 * (b) ret5 × ret20: 모멘텀 가속
 * 직교화: 교호항을 주효과에 OLS 회귀 후 잔차
 */
function interactionSignals(cs, singleZ) {
  const bodyZ  = singleZ['body'];
  const ret1Z  = singleZ['ret1'];
  const ret5Z  = singleZ['ret5'];
  const ret20Z = singleZ['ret20'];

  // 교호항 raw
  const bodyRet1_raw  = bodyZ.map((v,i)=>v*ret1Z[i]);
  const ret5Ret20_raw = ret5Z.map((v,i)=>v*ret20Z[i]);

  // 직교화: 교호항을 주효과들에 회귀 후 잔차
  const bodyRet1_orth  = olsResiduals(bodyRet1_raw,  bodyZ,  ret1Z);
  const ret5Ret20_orth = olsResiduals(ret5Ret20_raw, ret5Z, ret20Z);

  return {
    bodyXret1:  robustZ(bodyRet1_orth),
    ret5Xret20: robustZ(ret5Ret20_orth),
  };
}

/**
 * 마할라노비스 D² (6피처 Ledoit-Wolf)
 * 피처: relVol, ret1, ret5, ret20, body, range — robust z 단면 표준화 후 투입
 * D²는 부호 없는 크기 → signed fwd return 예측이 아닌
 * |fwd return| 또는 fwd 변동성 확대와의 관계로 검정
 */
function mahalSignal(cs) {
  const p = MAHAL_COLS.length;
  const n = cs.n;

  // 단면 robust z
  const Zmat = MAHAL_COLS.map(col => {
    const raw = cs.signals.map(r=>r[COL[col]]);
    return robustZ(raw);
  });
  // n×p 전치
  const X = Array.from({length:n}, (_,i) => MAHAL_COLS.map((_,a) => Zmat[a][i]));

  // 공분산 (이미 z-score이므로 평균≈0)
  let S = covMatrix(X, n, p);
  if (LW_SHRINK) S = ledoitWolfShrink(S, n, p);
  const Si = matInv(S, p);
  if (!Si) {
    // 역행렬 실패 → 단위행렬 대체 (안전망)
    return X.map(z => z.reduce((s,v)=>s+v*v,0));
  }
  return X.map(z => mahal(z, Si, p));
}

// ─────────────────────────────────────────────────────────
// 5. IC 산출 (날짜별 단면 Spearman)
// ─────────────────────────────────────────────────────────

/**
 * IC 계산 루프
 * @returns { signalName: { ic1:[], ic5:[], ic20:[], ic1_sn:[], ic5_sn:[] } }
 * sn = sector-neutral fwd return
 */
function computeICs() {
  // 신호별 IC 저장
  const signalNames = [
    ...SINGLE_FEATURES,
    'ret1_resid', 'turnoverPerp', 'momPersist',
    'bodyXret1', 'ret5Xret20',
    'mahal_abs_fwd1', // D² vs |fwd1|
    'mahal_fwd1_vol', // D² vs fwd1 분산 (날짜별 상관 불가 → 별도)
  ];
  const ics = {};
  for (const nm of signalNames) ics[nm] = {ic1:[], ic5:[], ic20:[], ic1_sn:[], ic5_sn:[]};

  // 마할라노비스는 signed IC별도 — D²는 부호없으므로 |fwd|와 상관
  ics['mahal_d2'] = {ic1_abs:[], ic5_abs:[], ic20_abs:[]};

  for (let t=0; t<T-1; t++) {  // T-1: fwd1 최소 보장
    const cs = getCrossSection(t);
    if (cs.n < 50) continue; // 단면 너무 작으면 스킵

    // forward returns
    const fwd1  = calcFwdReturn(cs.closeT, cs.fwdClose[1]);
    const fwd5  = t+5  < T ? calcFwdReturn(cs.closeT, cs.fwdClose[5])  : null;
    const fwd20 = t+20 < T ? calcFwdReturn(cs.closeT, cs.fwdClose[20]) : null;

    // 섹터중립 fwd (섹터 평균 제거)
    const fwd1_sn = fwd1 ? sectorNeutralResidual(fwd1.map(v=>v??0), cs.themes) : null;
    const fwd5_sn = fwd5 ? sectorNeutralResidual(fwd5.map(v=>v??0), cs.themes) : null;

    // 신호 산출
    const sZ   = singleFeatureSignals(cs);
    const resid = residualSignals(cs);
    const inter = interactionSignals(cs, sZ);
    const d2    = mahalSignal(cs);

    // 유효 인덱스 (fwd1 not null)
    const valid1  = fwd1  ? fwd1.map((_,i)=>i).filter(i=>fwd1[i]!==null)  : [];
    const valid5  = fwd5  ? fwd5.map((_,i)=>i).filter(i=>fwd5[i]!==null)  : [];
    const valid20 = fwd20 ? fwd20.map((_,i)=>i).filter(i=>fwd20[i]!==null): [];

    // IC helper
    function addIC(nm, sig) {
      if (!ics[nm]) return;
      const obj = ics[nm];
      if (valid1.length >= 30) {
        const sx = valid1.map(i=>sig[i]), sy = valid1.map(i=>fwd1[i]);
        const ic = spearman(sx,sy); if (isFinite(ic)) obj.ic1.push(ic);
        if (fwd1_sn) {
          const ic_sn = spearman(sx, valid1.map(i=>fwd1_sn[i]));
          if (isFinite(ic_sn)) obj.ic1_sn.push(ic_sn);
        }
      }
      if (fwd5 && valid5.length >= 30) {
        const sx = valid5.map(i=>sig[i]), sy = valid5.map(i=>fwd5[i]);
        const ic = spearman(sx,sy); if (isFinite(ic)) obj.ic5.push(ic);
        if (fwd5_sn) {
          const ic_sn = spearman(sx, valid5.map(i=>fwd5_sn[i]));
          if (isFinite(ic_sn)) obj.ic5_sn.push(ic_sn);
        }
      }
      if (fwd20 && valid20.length >= 30) {
        const sx = valid20.map(i=>sig[i]), sy = valid20.map(i=>fwd20[i]);
        const ic = spearman(sx,sy); if (isFinite(ic)) obj.ic20.push(ic);
      }
    }

    for (const feat of SINGLE_FEATURES) addIC(feat, sZ[feat]);
    addIC('ret1_resid',  resid.ret1_resid);
    addIC('turnoverPerp',resid.turnoverPerp);
    addIC('momPersist',  resid.momPersist);
    addIC('bodyXret1',   inter.bodyXret1);
    addIC('ret5Xret20',  inter.ret5Xret20);

    // D² vs |fwd1|, |fwd5|, |fwd20|
    if (valid1.length >= 30) {
      const sx  = valid1.map(i=>d2[i]);
      const sy1 = valid1.map(i=>Math.abs(fwd1[i]));
      const ic1a = spearman(sx,sy1); if (isFinite(ic1a)) ics['mahal_d2'].ic1_abs.push(ic1a);
    }
    if (fwd5 && valid5.length >= 30) {
      const sx  = valid5.map(i=>d2[i]);
      const sy5 = valid5.map(i=>Math.abs(fwd5[i]));
      const ic5a = spearman(sx,sy5); if (isFinite(ic5a)) ics['mahal_d2'].ic5_abs.push(ic5a);
    }
    if (fwd20 && valid20.length >= 30) {
      const sx   = valid20.map(i=>d2[i]);
      const sy20 = valid20.map(i=>Math.abs(fwd20[i]));
      const ic20a = spearman(sx,sy20); if (isFinite(ic20a)) ics['mahal_d2'].ic20_abs.push(ic20a);
    }
  }

  return ics;
}

// ─────────────────────────────────────────────────────────
// 6. 롱숏 분위 스프레드
// ─────────────────────────────────────────────────────────

/**
 * 날짜별 신호로 상위10% 매수 / 하위10% 매도 → 일별 롱숏 수익
 * 회전율: 각 날짜 포지션 변동을 측정하여 거래비용 추정
 */
function longShortBacktest(signalExtractor, horizon=1) {
  const dailyRet = [];
  const dailyTurnover = [];
  let prevLong=new Set(), prevShort=new Set();

  const maxT = T - horizon - 1;
  for (let t=0; t<maxT; t++) {
    const cs = getCrossSection(t);
    if (cs.n < 50) continue;

    const sig  = signalExtractor(cs);
    const fwdK = calcFwdReturn(cs.closeT, cs.fwdClose[horizon]);

    // 유효 (fwd not null)
    const pairs = sig.map((s,i)=>[s,fwdK[i],cs.codes[i]]).filter(([s,f])=>f!==null && isFinite(s) && isFinite(f));
    if (pairs.length < 20) continue;

    pairs.sort((a,b)=>a[0]-b[0]);
    const total = pairs.length;
    const cutLo = Math.floor(total*QUANTILE_LO);
    const cutHi = Math.floor(total*QUANTILE_HI);

    const shortPairs = pairs.slice(0, cutLo);        // 하위 10%
    const longPairs  = pairs.slice(cutHi);           // 상위 10%

    const longRet  = mean(longPairs.map(([,f])=>f));
    const shortRet = mean(shortPairs.map(([,f])=>f));
    const spread   = longRet - shortRet; // 롱숏 스프레드

    // 회전율: 이전 대비 새 종목 비율
    const curLong  = new Set(longPairs.map(([,,c])=>c));
    const curShort = new Set(shortPairs.map(([,,c])=>c));
    const turnL = [...curLong].filter(c=>!prevLong.has(c)).length  / (curLong.size||1);
    const turnS = [...curShort].filter(c=>!prevShort.has(c)).length/ (curShort.size||1);
    const turnover = (turnL + turnS) / 2;

    dailyRet.push(spread);
    dailyTurnover.push(turnover);
    prevLong=curLong; prevShort=curShort;
  }

  const avgTurnover = mean(dailyTurnover);
  // 거래비용 차감: 왕복비용 * 회전율 (일별 적용)
  const tcLow  = (TC_BPS_LOW/10000)  * avgTurnover;
  const tcHigh = (TC_BPS_HIGH/10000) * avgTurnover;

  const grossMeanRet = mean(dailyRet);
  const netLow  = grossMeanRet - tcLow;
  const netHigh = grossMeanRet - tcHigh;

  // 연율화: 252거래일 기준
  const annualFactor = 252 / horizon;
  const annGross = grossMeanRet * annualFactor;
  const annNetLow  = netLow  * annualFactor;
  const annNetHigh = netHigh * annualFactor;

  return {
    nDays: dailyRet.length,
    grossMeanRet,
    annGross,
    annNetLow, annNetHigh,
    avgTurnover,
    tcLow, tcHigh,
    sharpe: grossMeanRet / (std(dailyRet)||1) * Math.sqrt(annualFactor),
    dailyRet,
  };
}

// ─────────────────────────────────────────────────────────
// 7. IC 통계량 요약
// ─────────────────────────────────────────────────────────

function summarizeIC(icArr) {
  if (!icArr || icArr.length < 3) return {n:0, mean:NaN, se:NaN, t:NaN};
  const n = icArr.length;
  const m = mean(icArr);
  const s = std(icArr, m);
  const se = s / Math.sqrt(n);
  const t = m / se;
  return {n, mean: m, se, t};
}

function fmt(n, d=4) { return isFinite(n) ? n.toFixed(d) : 'NaN'; }
function fmtPct(n, d=2) { return isFinite(n) ? (n*100).toFixed(d)+'%' : 'NaN'; }
function fmtBp(n) { return isFinite(n) ? (n*10000).toFixed(1)+'bp' : 'NaN'; }

// ─────────────────────────────────────────────────────────
// 8. 메인 실행
// ─────────────────────────────────────────────────────────

console.log('\n[1/4] IC 계산 중...');
const ics = computeICs();

console.log('[2/4] 롱숏 백테스트 중...');

// 주요 신호 추출기 — 롱숏용
function makeExtractor(sigFn) { return cs => sigFn(cs); }

const lsResults = {};

// 단일 피처 — relVol, ret1_resid, momPersist 대표 3개 + 전체
for (const feat of SINGLE_FEATURES) {
  const extractor = cs => singleFeatureSignals(cs)[feat];
  lsResults[feat] = {
    h1:  longShortBacktest(extractor, 1),
    h5:  longShortBacktest(extractor, 5),
  };
}
// 고유 잔차
const resid_extractors = {
  ret1_resid:   cs => residualSignals(cs).ret1_resid,
  turnoverPerp: cs => residualSignals(cs).turnoverPerp,
  momPersist:   cs => residualSignals(cs).momPersist,
};
for (const [nm, ext] of Object.entries(resid_extractors)) {
  lsResults[nm] = { h1: longShortBacktest(ext, 1), h5: longShortBacktest(ext, 5) };
}
// 교호항
const inter_extractors = {
  bodyXret1:   cs => { const sZ=singleFeatureSignals(cs); return interactionSignals(cs,sZ).bodyXret1; },
  ret5Xret20:  cs => { const sZ=singleFeatureSignals(cs); return interactionSignals(cs,sZ).ret5Xret20; },
};
for (const [nm, ext] of Object.entries(inter_extractors)) {
  lsResults[nm] = { h1: longShortBacktest(ext, 1), h5: longShortBacktest(ext, 5) };
}
// 마할라노비스 (D² 크기로 상하위 분리 → 상위 = 이상치)
const mahal_extractor = cs => mahalSignal(cs);
lsResults['mahal_d2'] = { h1: longShortBacktest(mahal_extractor, 1), h5: longShortBacktest(mahal_extractor, 5) };

console.log('[3/4] 결과 정리 중...');

// ─────────────────────────────────────────────────────────
// 9. Bonferroni 보정 임계치
// ─────────────────────────────────────────────────────────
// 검정 신호 수: 8(단일) + 3(잔차) + 2(교호) + 1(D²) = 14
// α=0.05 Bonferroni: |t| > t_{0.05/14} ≈ 3.07 (양측)
const N_TESTS = 14;
const BONF_T  = 3.07; // 보수적 임계치 (정규 근사)
const RAW_T   = 1.96; // 보정 없는 5% 임계치

function verdict(t_stat, icMean) {
  if (!isFinite(t_stat)) return '데이터 부족';
  const absT = Math.abs(t_stat);
  if (absT >= BONF_T) return icMean > 0 ? '★ 잠재 신호(Bonferroni 통과)' : '★ 잠재 역신호(Bonferroni 통과)';
  if (absT >= RAW_T)  return '△ 약한 서술적 지속 (다중검정 미보정)';
  return '○ 노이즈';
}

// ─────────────────────────────────────────────────────────
// 10. 마크다운 리포트 생성
// ─────────────────────────────────────────────────────────

console.log('[4/4] 마크다운 보고서 작성 중...');

const lines = [];
const L = s => lines.push(s);

L(`# SBV 신호 정직 백테스트 결과`);
L(``);
L(`> 데이터: stock-panel.json — 441종목 × 140거래일 (${DATES[0]} ~ ${DATES[T-1]})`);
L(`> 생성일: ${new Date().toISOString().slice(0,10)}`);
L(``);
L(`## 0. 누설 자가점검`);
L(``);
L(`- rows[t]는 t 날짜까지의 과거 봉 값만으로 산출됨 (패널 생성 시 룩어헤드 차단 확인).`);
L(`- 신호: t 시점 rows[t] 사용. 타깃: close[t+k] 별도 추출. 교호항·잔차도 모두 t 단면 값만 사용.`);
L(`- **누설 없음.**`);
L(``);
L(`## 1. 소표본 경고`);
L(``);
L(`| 항목 | 값 |`);
L(`|---|---|`);
L(`| 총 거래일(T) | ${T}일 |`);
L(`| 단면 종목 수(N) | ~${N}종목 |`);
L(`| fwd1 유효 날짜 수 | ~${T-1}일 |`);
L(`| fwd5 유효 날짜 수 | ~${T-5}일 |`);
L(`| fwd20 유효 날짜 수 | ~${T-20}일 (중첩 수익률 → 유효 독립 표본 ≈ ${Math.floor((T-20)/20)}개) |`);
L(`| 검정 신호 수 | ${N_TESTS}개 |`);
L(`| Bonferroni 보정 t 임계치 | \|t\| ≥ ${BONF_T} |`);
L(`| 무보정 t 임계치 (α=0.05) | \|t\| ≥ ${RAW_T} |`);
L(``);
L(`> fwd20은 수익률이 중첩(overlapping)되므로 유효 독립 표본이 ~${Math.floor((T-20)/20)}개에 불과합니다.`);
L(`> 단면 간 상관으로 실효 자유도가 추가로 감소합니다. t-stat 해석 시 주의.`);
L(``);
L(`## 2. 단일 피처 z — Rank IC (Spearman)`);
L(``);
L(`### 2-1. raw fwd return 대비 IC`);
L(``);
L(`| 신호 | IC(fwd1) | t(fwd1) | IC(fwd5) | t(fwd5) | IC(fwd20) | t(fwd20) | 판정 |`);
L(`|---|---|---|---|---|---|---|---|`);

for (const feat of SINGLE_FEATURES) {
  const ic1  = summarizeIC(ics[feat].ic1);
  const ic5  = summarizeIC(ics[feat].ic5);
  const ic20 = summarizeIC(ics[feat].ic20);
  const vd   = verdict(ic1.t, ic1.mean);
  L(`| ${feat} | ${fmt(ic1.mean,4)} | ${fmt(ic1.t,2)} | ${fmt(ic5.mean,4)} | ${fmt(ic5.t,2)} | ${fmt(ic20.mean,4)} | ${fmt(ic20.t,2)} | ${vd} |`);
}

L(``);
L(`### 2-2. 섹터중립 fwd return 대비 IC (섹터 평균 제거)`);
L(``);
L(`| 신호 | IC(fwd1_sn) | t(fwd1_sn) | IC(fwd5_sn) | t(fwd5_sn) | 판정 |`);
L(`|---|---|---|---|---|---|`);

for (const feat of SINGLE_FEATURES) {
  const ic1sn = summarizeIC(ics[feat].ic1_sn);
  const ic5sn = summarizeIC(ics[feat].ic5_sn);
  const vd    = verdict(ic1sn.t, ic1sn.mean);
  L(`| ${feat} | ${fmt(ic1sn.mean,4)} | ${fmt(ic1sn.t,2)} | ${fmt(ic5sn.mean,4)} | ${fmt(ic5sn.t,2)} | ${vd} |`);
}

L(``);
L(`## 3. 고유 잔차 신호 — Rank IC`);
L(``);
L(`| 신호 | 설명 | IC(fwd1) | t(fwd1) | IC(fwd5) | t(fwd5) | IC(fwd1_sn) | t(fwd1_sn) | 판정 |`);
L(`|---|---|---|---|---|---|---|---|---|`);

const residDesc = {
  ret1_resid:   'ret1 − 시장·섹터 평균',
  turnoverPerp: 'turnover ⊥ mktCap (순수 자금유입)',
  momPersist:   'ret20 ⊥ ret5 (모멘텀 지속성)',
};
for (const nm of ['ret1_resid','turnoverPerp','momPersist']) {
  const ic1   = summarizeIC(ics[nm].ic1);
  const ic5   = summarizeIC(ics[nm].ic5);
  const ic1sn = summarizeIC(ics[nm].ic1_sn);
  const vd    = verdict(ic1.t, ic1.mean);
  L(`| ${nm} | ${residDesc[nm]} | ${fmt(ic1.mean,4)} | ${fmt(ic1.t,2)} | ${fmt(ic5.mean,4)} | ${fmt(ic5.t,2)} | ${fmt(ic1sn.mean,4)} | ${fmt(ic1sn.t,2)} | ${vd} |`);
}

L(``);
L(`## 4. 교호항 — Rank IC`);
L(``);
L(`| 신호 | 설명 | IC(fwd1) | t(fwd1) | IC(fwd5) | t(fwd5) | 판정 |`);
L(`|---|---|---|---|---|---|---|`);

const interDesc = {
  bodyXret1:  'body×ret1 직교화 (동조강도)',
  ret5Xret20: 'ret5×ret20 직교화 (모멘텀 가속)',
};
for (const nm of ['bodyXret1','ret5Xret20']) {
  const ic1 = summarizeIC(ics[nm].ic1);
  const ic5 = summarizeIC(ics[nm].ic5);
  const vd  = verdict(ic1.t, ic1.mean);
  L(`| ${nm} | ${interDesc[nm]} | ${fmt(ic1.mean,4)} | ${fmt(ic1.t,2)} | ${fmt(ic5.mean,4)} | ${fmt(ic5.t,2)} | ${vd} |`);
}

L(``);
L(`## 5. 마할라노비스 D² — 변동성 예측 (signed fwd return과 구분)`);
L(``);
L(`> D²는 부호 없는 이상 강도. signed return 예측이 아닌 **미래 |수익| 확대 여부**로 검정.`);
L(`> 피처: ${MAHAL_COLS.join(', ')} — robust z 단면 표준화 후 Ledoit-Wolf 수축 공분산 사용.`);
L(``);
L(`| 관계 | IC(\|fwd1\|) | t | IC(\|fwd5\|) | t | IC(\|fwd20\|) | t | 판정 |`);
L(`|---|---|---|---|---|---|---|---|`);

const d2ic1  = summarizeIC(ics['mahal_d2'].ic1_abs);
const d2ic5  = summarizeIC(ics['mahal_d2'].ic5_abs);
const d2ic20 = summarizeIC(ics['mahal_d2'].ic20_abs);
const d2vd   = verdict(d2ic1.t, d2ic1.mean);
L(`| D² vs \|fwd return\| | ${fmt(d2ic1.mean,4)} | ${fmt(d2ic1.t,2)} | ${fmt(d2ic5.mean,4)} | ${fmt(d2ic5.t,2)} | ${fmt(d2ic20.mean,4)} | ${fmt(d2ic20.t,2)} | ${d2vd} |`);

L(``);
L(`## 6. IC 감쇠 (horizon별 비교)`);
L(``);
L(`| 신호 | IC(h=1) | IC(h=5) | IC(h=20) | 감쇠 패턴 |`);
L(`|---|---|---|---|---|`);

const allSigs = [
  ...SINGLE_FEATURES,
  'ret1_resid','turnoverPerp','momPersist',
  'bodyXret1','ret5Xret20',
];
for (const nm of allSigs) {
  const ic1  = summarizeIC(ics[nm].ic1);
  const ic5  = summarizeIC(ics[nm].ic5);
  const ic20 = summarizeIC(ics[nm].ic20);
  let decay = '-';
  if (isFinite(ic1.mean) && isFinite(ic5.mean)) {
    const ratio = Math.abs(ic5.mean) / (Math.abs(ic1.mean)||1e-9);
    if (ratio > 1.1) decay = '증가';
    else if (ratio > 0.7) decay = '유지';
    else decay = '빠른 감쇠';
  }
  L(`| ${nm} | ${fmt(ic1.mean,4)} | ${fmt(ic5.mean,4)} | ${fmt(ic20.mean,4)} | ${decay} |`);
}

L(``);
L(`## 7. 롱숏 분위 스프레드 (거래비용 전후)`);
L(``);
L(`> 상위 10% 매수 / 하위 10% 매도, 동일가중. 왕복 거래비용 ${TC_BPS_LOW}~${TC_BPS_HIGH}bp 가정.`);
L(`> 회전율(turnover)은 포지션 변동 비율. 연율화: ×252/horizon.`);
L(``);
L(`### 7-1. horizon=1일`);
L(``);
L(`| 신호 | 일평균 gross | 연율 gross | 연율 net(40bp) | 연율 net(60bp) | 평균 회전율 | 판정 |`);
L(`|---|---|---|---|---|---|---|`);

for (const nm of [...SINGLE_FEATURES, 'ret1_resid','turnoverPerp','momPersist','bodyXret1','ret5Xret20','mahal_d2']) {
  const r = lsResults[nm]?.h1;
  if (!r) { L(`| ${nm} | - | - | - | - | - | - |`); continue; }
  const vd = r.annGross > 0.01 ? (r.annNetLow > 0 ? '▲ 비용후 양수' : '~ 비용 먹힘') : '▼ gross 음수/0';
  L(`| ${nm} | ${fmtBp(r.grossMeanRet)} | ${fmtPct(r.annGross)} | ${fmtPct(r.annNetLow)} | ${fmtPct(r.annNetHigh)} | ${fmtPct(r.avgTurnover)} | ${vd} |`);
}

L(``);
L(`### 7-2. horizon=5일`);
L(``);
L(`| 신호 | 일평균 gross | 연율 gross | 연율 net(40bp) | 연율 net(60bp) | 평균 회전율 | 판정 |`);
L(`|---|---|---|---|---|---|---|`);

for (const nm of [...SINGLE_FEATURES, 'ret1_resid','turnoverPerp','momPersist','bodyXret1','ret5Xret20','mahal_d2']) {
  const r = lsResults[nm]?.h5;
  if (!r) { L(`| ${nm} | - | - | - | - | - | - |`); continue; }
  const vd = r.annGross > 0.01 ? (r.annNetLow > 0 ? '▲ 비용후 양수' : '~ 비용 먹힘') : '▼ gross 음수/0';
  L(`| ${nm} | ${fmtBp(r.grossMeanRet)} | ${fmtPct(r.annGross)} | ${fmtPct(r.annNetLow)} | ${fmtPct(r.annNetHigh)} | ${fmtPct(r.avgTurnover)} | ${vd} |`);
}

L(``);
L(`## 8. 시장·섹터 통제 — raw vs 섹터중립 IC 비교`);
L(``);
L(`> 섹터중립 IC가 raw IC보다 크면 → 신호가 섹터 공통 움직임이 아닌 고유 예측력 보유.`);
L(`> 섹터중립 IC가 raw IC보다 작아지면 → 신호 대부분이 섹터 베타에서 유래.`);
L(``);
L(`| 신호 | IC raw(fwd1) | IC sn(fwd1) | raw→sn 변화 | 고유 예측 여부 |`);
L(`|---|---|---|---|---|`);

for (const nm of [...SINGLE_FEATURES, 'ret1_resid','turnoverPerp','momPersist']) {
  const icr  = summarizeIC(ics[nm].ic1);
  const icsn = summarizeIC(ics[nm].ic1_sn);
  if (!isFinite(icr.mean) || !isFinite(icsn.mean)) continue;
  const ratio  = Math.abs(icsn.mean) / (Math.abs(icr.mean)||1e-9);
  const change = ratio > 1.05 ? '↑ 증가' : ratio < 0.95 ? '↓ 감소' : '→ 유사';
  const isIdio = ratio >= 0.8 ? '고유 포함' : '섹터 의존';
  L(`| ${nm} | ${fmt(icr.mean,4)} | ${fmt(icsn.mean,4)} | ${change} (${fmt(ratio,2)}x) | ${isIdio} |`);
}

L(``);
L(`## 9. 다중검정 경고`);
L(``);
L(`- 이번 검정에서 시험한 신호: **${N_TESTS}개**.`);
L(`- 귀무가설(IC=0) 하에 5% 유의수준으로 우연히 유의 결과가 나올 기댓값: **${(N_TESTS*0.05).toFixed(1)}개**.`);
L(`- Bonferroni 보정 임계치: **|t| ≥ ${BONF_T}** (양측 α=0.05/${N_TESTS}).`);
L(`- López de Prado(2018): "여러 신호를 동시에 시험하면 우연히 좋은 결과가 반드시 나온다." 단일 t-stat 신뢰 금지.`);
L(`- **소표본 추가 경고**: 140일은 짧고, fwd20은 중첩으로 유효 독립 표본 ≈ ${Math.floor((T-20)/20)}개. t-stat 과대 추정 가능.`);
L(``);
L(`## 10. 신호별 종합 판정`);
L(``);
L(`| 신호 | IC(fwd1) t-stat | Bonferroni | 거래비용 후 | 판정 |`);
L(`|---|---|---|---|---|`);

const allSignals = [
  ...SINGLE_FEATURES,
  'ret1_resid','turnoverPerp','momPersist',
  'bodyXret1','ret5Xret20','mahal_d2',
];

for (const nm of allSignals) {
  let tval;
  if (nm === 'mahal_d2') {
    tval = summarizeIC(ics['mahal_d2'].ic1_abs).t;
  } else {
    tval = summarizeIC(ics[nm].ic1).t;
  }
  const absT   = isFinite(tval) ? Math.abs(tval) : 0;
  const bonfOk = absT >= BONF_T ? 'Y' : 'N';
  const lsR    = lsResults[nm]?.h1;
  const netOk  = lsR && lsR.annNetLow > 0 ? 'Y' : 'N';
  let finalVerdict;
  if (bonfOk === 'Y' && netOk === 'Y') {
    finalVerdict = '★★ 잠재 신호 (IC 유의 + 비용후 양수) — 관측 지속성';
  } else if (bonfOk === 'Y') {
    finalVerdict = '★ 잠재 신호 (IC 유의, 비용 흡수) — 관측 지속성만';
  } else if (absT >= RAW_T) {
    finalVerdict = '△ 약한 서술적 지속 (다중검정 미보정)';
  } else {
    finalVerdict = '○ 노이즈';
  }
  L(`| ${nm} | ${fmt(tval,2)} | ${bonfOk} | ${netOk} | ${finalVerdict} |`);
}

L(``);
L(`## 11. "관측 지속성" vs "거래가능 알파" 구분`);
L(``);
L(`| 구분 | 정의 | 판단 기준 |`);
L(`|---|---|---|`);
L(`| 관측 지속성 | 신호와 미래 수익 사이에 통계적 연관이 시간 단면에서 반복됨 | IC t-stat Bonferroni 통과 |`);
L(`| 거래가능 알파 | 거래비용·슬리피지 차감 후에도 양의 초과수익 실현 가능 | annNet > 0 + 실거래 검증 |`);
L(``);
L(`> **주의**: 관측 지속성이 있어도 거래가능 알파가 아닐 수 있음.`);
L(`> - 한국 시장 왕복비용 40~60bp는 IC=0.02~0.04 수준 신호의 스프레드를 대부분 잠식.`);
L(`> - McLean-Pontiff(2016): 학술 발표 후 알파 ~58% 소멸. 이미 알려진 신호일수록 edge 약화.`);
L(`> - 소표본(T=140) + 단면 상관 → t-stat 과대추정 위험.`);
L(`> - 이상(anomaly) ≠ 매매 신호. 점수는 "주목도"이며 단정적 매수/매도 라벨 불가.`);
L(``);
L(`## 12. 최종 한 줄 결론`);
L(``);

// 결론 자동 생성
const bonferroniWinners = allSignals.filter(nm => {
  const t = nm === 'mahal_d2'
    ? summarizeIC(ics['mahal_d2'].ic1_abs).t
    : summarizeIC(ics[nm].ic1).t;
  return isFinite(t) && Math.abs(t) >= BONF_T;
});
const netPositive = allSignals.filter(nm => lsResults[nm]?.h1?.annNetLow > 0);

let conclusion;
if (bonferroniWinners.length === 0) {
  conclusion = `과거 140일 패널에서 Bonferroni 보정(|t|≥${BONF_T}) 기준을 통과한 신호가 없음 — EMH·McLean-Pontiff와 정합하며, 모든 신호는 현재 "노이즈 또는 약한 서술적 지속" 수준에 머문다. 거래가능 알파 단정 불가.`;
} else if (netPositive.length === 0) {
  conclusion = `Bonferroni 기준 통과 신호 [${bonferroniWinners.join(', ')}]가 관측 지속성을 보이나, 거래비용(왕복 40~60bp) 차감 후 순수익이 모두 0 이하 — **관측 지속성은 존재하나 거래가능 알파는 미확인**. 더 긴 패널과 실거래 검증 필요.`;
} else {
  conclusion = `Bonferroni 기준 통과 신호 [${bonferroniWinners.join(', ')}] 중 [${netPositive.join(', ')}]는 비용 차감 후에도 양수 — 단, T=140일 소표본·다중검정·중첩수익률 한계로 **거래가능 알파 단정 불가**. "관측 지속성"의 초기 증거로만 해석. 실거래 전 독립 표본 검증 필수.`;
}

L(conclusion);
L(``);
L(`---`);
L(`*이상(anomaly) ≠ 매매신호. 모든 결과는 과거 단일 패널의 서술적 관측이며 투자 조언이 아닙니다.*`);

// 파일 저장
const mdContent = lines.join('\n');
fs.writeFileSync(OUT_MD, mdContent, 'utf8');
console.log(`\n보고서 저장 완료: ${OUT_MD}`);
console.log('=== 검증 요약 ===');
console.log(`검정 신호: ${N_TESTS}개`);
console.log(`Bonferroni 통과(|t|>=${BONF_T}):`, bonferroniWinners.length ? bonferroniWinners.join(', ') : '없음');
console.log(`비용 후 양수:`, netPositive.length ? netPositive.join(', ') : '없음');
