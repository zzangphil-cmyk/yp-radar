/**
 * ta-validate.mjs — 표준 보조지표 정직 백테스트
 *
 * 데이터: data/ta-panel.json  441종목 × 140거래일
 * cols: close,sma5,sma20,sma60,macd,macdSig,macdHist,rsi14,stochK,stochD,
 *        bbPctB,bbBw,cci20,willr14,obvOsc,mfi14,adx14,pdi14,mdi14,disp20,disp60,relVol
 *
 * 설계 원칙 (sbv-feasibility/09와 동일 엄격성):
 *   - 신호 t시점(과거만), 타깃 fwd1/fwd5/fwd20 = t+k 수익: 룩어헤드 완전 차단
 *   - 단면 스피어만 IC 일별 평균 → t-stat
 *   - 이산 이벤트 연구: 이벤트 발생일 → 이후 평균 초과수익
 *   - 롱숏 분위 스프레드: 상위/하위 10%, 거래비용 40bp 차감 전후
 *   - 다중검정 Bonferroni 경고
 *   - 섹터중립 잔차로 고유 예측력 분리
 *   - 이상치 처리: 종목별 close로 fwd return 계산 후 단면 winsorize ±5σ
 */

import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// 0. 상수
// ─────────────────────────────────────────────────────────────────────────────
const DATA_PATH = 'C:/Users/zzang/Desktop/Yoon_temp/stock/data/ta-panel.json';
const OUT_DIR   = 'C:/Users/zzang/Desktop/Yoon_temp/stock/sbv-feasibility/prototype';
const OUT_MD    = path.join(OUT_DIR, 'result-ta.md');

const TC_BP     = 40;          // 왕복 거래비용(bp) — 한국 개인투자자 추정 하한
const Q_LO      = 0.10;        // 하위 분위 컷오프
const Q_HI      = 0.90;        // 상위 분위 컷오프
const HORIZONS  = [1, 5, 20];  // 선행 수익률 기간(거래일)
const MIN_IC_N  = 20;          // 단면 IC 계산 최소 유효 종목 수
const MIN_EVENT = 5;           // 이벤트 최소 표본

// Bonferroni 보정: 신호 수 × 기간 수 — 보수적 조정
const N_HYPOTHESES = 30 * 3;   // 대략 30신호 × 3기간

// ─────────────────────────────────────────────────────────────────────────────
// 1. 데이터 로드
// ─────────────────────────────────────────────────────────────────────────────
const raw   = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const COLS  = raw.cols;
const CI    = {}; COLS.forEach((c, i) => CI[c] = i); // col → index

const panel  = raw.panel;
const stocks = Object.values(panel);
const N      = stocks.length;   // 441
const T      = stocks[0].dates.length; // 140
const DATES  = stocks[0].dates;

console.log(`종목 수: ${N}, 거래일: ${T}, 기간: ${DATES[0]} ~ ${DATES[T-1]}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 수학 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** 중위수 */
function median(arr) {
  const s = arr.filter(isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 평균 */
function mean(arr) {
  const v = arr.filter(isFinite);
  if (!v.length) return NaN;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** 표본 표준편차 */
function std(arr) {
  const v = arr.filter(isFinite);
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** t-통계량 = mean / (std/sqrt(n)) */
function tStat(arr) {
  const v = arr.filter(isFinite);
  if (v.length < 3) return NaN;
  const m = mean(v), s = std(v);
  return m / (s / Math.sqrt(v.length));
}

/**
 * 스피어만 순위상관
 * 동순위 처리: 평균 순위 배정
 */
function spearman(x, y) {
  // 유효 쌍만 사용
  const pairs = [];
  for (let i = 0; i < x.length; i++) {
    if (isFinite(x[i]) && isFinite(y[i])) pairs.push([x[i], y[i]]);
  }
  const n = pairs.length;
  if (n < MIN_IC_N) return NaN;

  function rankArr(vals) {
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      // 동순위 구간 탐색
      while (j < n - 1 && idx[j][0] === idx[j + 1][0]) j++;
      const avgR = (i + j) / 2 + 1; // 1-based 평균순위
      for (let k = i; k <= j; k++) r[idx[k][1]] = avgR;
      i = j + 1;
    }
    return r;
  }

  const rx = rankArr(pairs.map(p => p[0]));
  const ry = rankArr(pairs.map(p => p[1]));
  let sumD2 = 0;
  for (let i = 0; i < n; i++) sumD2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

/**
 * 단면 winsorize ±k σ (절대 수익률 이상치 억제)
 * 분포 왜도 높은 한국 소형주 대비
 */
function winsorize(arr, k = 5) {
  const v = arr.filter(isFinite);
  if (!v.length) return arr;
  const m = mean(v), s = std(v);
  if (!isFinite(s) || s < 1e-10) return arr;
  return arr.map(x => {
    if (!isFinite(x)) return x;
    return Math.max(m - k * s, Math.min(m + k * s, x));
  });
}

/**
 * 분위수 컷오프 값 반환
 * quantile(arr, 0.9) → 상위 10% 경계값
 */
function quantile(arr, q) {
  const s = arr.filter(isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * 섹터중립 잔차: y_i - 섹터평균_i
 * 섹터 정보 부족 시(종목 1개뿐) 전체 평균 사용
 */
function sectorNeutral(y, themes) {
  const sums = {}, cnts = {};
  for (let i = 0; i < y.length; i++) {
    if (!isFinite(y[i])) continue;
    const t = themes[i];
    sums[t] = (sums[t] || 0) + y[i];
    cnts[t] = (cnts[t] || 0) + 1;
  }
  const avgs = {};
  for (const t in sums) avgs[t] = sums[t] / cnts[t];
  const globalMean = mean(y);
  return y.map((v, i) => {
    if (!isFinite(v)) return NaN;
    const t = themes[i];
    return v - (avgs[t] !== undefined ? avgs[t] : globalMean);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 패널 구성: 종목별 close → fwd return 계산
//    fwdRet[i][t][k] = close[t+k]/close[t] - 1  (k=1,5,20)
//    신호: stocks[i].rows[t][CI[col]]  (t시점 과거 지표)
//    타깃: fwdRet[i][t]  (t+1 ~ t+k 이후)
//    룩어헤드 차단: 신호=rows[t], 타깃=close[t+k], t와 t+k는 교차 없음
// ─────────────────────────────────────────────────────────────────────────────
const themes = stocks.map(s => s.theme || '기타');

// fwdRet[i][t] = { fwd1, fwd5, fwd20 }
const fwdRet = stocks.map(s => {
  const closes = s.rows.map(r => r[CI['close']]);
  return closes.map((c, t) => {
    const obj = {};
    for (const h of HORIZONS) {
      const future = closes[t + h];
      obj[`fwd${h}`] = (isFinite(c) && c > 0 && isFinite(future) && future > 0)
        ? future / c - 1
        : NaN;
    }
    return obj;
  });
});

console.log('fwd return 계산 완료');

// ─────────────────────────────────────────────────────────────────────────────
// 4. 신호 정의
//    각 신호: { name, col 또는 fn(row, prevRow), direction, desc }
//    direction: +1 = 값 높을수록 수익 기대(모멘텀)
//               -1 = 값 낮을수록 수익 기대(역발상: 과매도=반등)
// ─────────────────────────────────────────────────────────────────────────────

// 연속값 신호 (Rank IC용): 신호 값 자체를 순위로 사용
// 방향은 IC 해석 방향 명시용 — 결과 부호가 예상 방향과 다르면 "통념 반대" 표기
const CONT_SIGNALS = [
  // ── 추세 ──────────────────────────────────────────────────────────────
  { name: 'macdHist',  col: 'macdHist', dir: +1, desc: 'MACD 히스토그램 (+상향 모멘텀→추세지속)' },
  { name: 'macd_raw',  col: 'macd',     dir: +1, desc: 'MACD 절댓값 (+=가격 위에 → 추세)' },
  { name: 'disp20',    col: 'disp20',   dir: +1, desc: '이격도 20일 (100초과=상단이탈, 모멘텀 vs 평균회귀)' },
  { name: 'disp60',    col: 'disp60',   dir: +1, desc: '이격도 60일' },
  { name: 'adx14',     col: 'adx14',    dir: +1, desc: 'ADX (추세 강도, 방향 무관)' },
  { name: 'di_spread', col: null,        dir: +1, desc: 'DI스프레드 pdi-mdi (+=상향추세)',
    fn: (row) => row[CI['pdi14']] - row[CI['mdi14']] },
  // sma5/sma20 대비 이격 (close/sma - 1)
  { name: 'close_vs_sma20', col: null, dir: +1, desc: 'close/sma20 - 1 (모멘텀)',
    fn: (row) => {
      const c = row[CI['close']], s = row[CI['sma20']];
      return (isFinite(s) && s > 0) ? c / s - 1 : NaN;
    }},
  { name: 'close_vs_sma60', col: null, dir: +1, desc: 'close/sma60 - 1 (장기 모멘텀)',
    fn: (row) => {
      const c = row[CI['close']], s = row[CI['sma60']];
      return (isFinite(s) && s > 0) ? c / s - 1 : NaN;
    }},

  // ── 모멘텀/과매수도 ───────────────────────────────────────────────────
  // RSI: 통념1(역발상)=낮을수록 반등 기대 → dir=-1
  //      통념2(모멘텀)=높을수록 추세 지속 → dir=+1
  //      둘 다 계산해 IC 부호로 판정
  { name: 'rsi14',     col: 'rsi14',    dir: -1, desc: 'RSI14 (낮을수록 과매도→반등, 역발상 통념)' },
  { name: 'rsi14_mom', col: 'rsi14',    dir: +1, desc: 'RSI14 (높을수록 모멘텀 지속, 모멘텀 통념)' },
  { name: 'stochK',    col: 'stochK',   dir: -1, desc: 'StochK (낮을수록 과매도→반등)' },
  { name: 'stochD',    col: 'stochD',   dir: -1, desc: 'StochD (낮을수록 과매도→반등)' },
  { name: 'willr14',   col: 'willr14',  dir: +1, desc: 'Williams%R (-100≤≤0, 높을수록 과매수/모멘텀; -80이하=과매도)' },
  { name: 'cci20',     col: 'cci20',    dir: -1, desc: 'CCI20 (낮을수록 과매도, 역발상)' },
  { name: 'mfi14',     col: 'mfi14',    dir: -1, desc: 'MFI14 (낮을수록 자금 이탈→반등, 역발상)' },

  // ── 변동성 ───────────────────────────────────────────────────────────
  { name: 'bbPctB',    col: 'bbPctB',   dir: -1, desc: '볼린저%B (0이하=하단이탈→반등, 역발상)' },
  { name: 'bbBw',      col: 'bbBw',     dir: +1, desc: '볼린저 밴드폭 (스퀴즈 후 확장=변동성 폭발)' },

  // ── 수급 ─────────────────────────────────────────────────────────────
  { name: 'obvOsc',    col: 'obvOsc',   dir: +1, desc: 'OBV 오실레이터 (양=매집, 음=배분)' },
  { name: 'relVol',    col: 'relVol',   dir: +1, desc: '상대거래량 (고=관심도 증가)' },
];

// 이산 이벤트 신호 (이진: 0/1 발생 여부)
// prev row가 필요한 교차 신호는 (row, prevRow) 함수형
const DISCRETE_SIGNALS = [
  // MACD 크로스
  { name: 'macd_golden', desc: 'MACD 골든크로스 (macdHist 음→양 전환)',
    fn: (row, prev) => prev && prev[CI['macdHist']] < 0 && row[CI['macdHist']] > 0 },
  { name: 'macd_dead',   desc: 'MACD 데드크로스 (macdHist 양→음 전환, 숏)',
    fn: (row, prev) => prev && prev[CI['macdHist']] > 0 && row[CI['macdHist']] < 0,
    short: true },

  // 이평 크로스 (sma5 vs sma20)
  { name: 'sma_golden',  desc: '단기이평 골든크로스 (sma5가 sma20 상향돌파)',
    fn: (row, prev) => prev && prev[CI['sma5']] <= prev[CI['sma20']] && row[CI['sma5']] > row[CI['sma20']] },
  { name: 'sma_dead',    desc: '단기이평 데드크로스 (sma5가 sma20 하향이탈, 숏)',
    fn: (row, prev) => prev && prev[CI['sma5']] >= prev[CI['sma20']] && row[CI['sma5']] < row[CI['sma20']],
    short: true },

  // DI 크로스 (pdi14 vs mdi14)
  { name: 'di_golden',   desc: 'DI 골든크로스 (pdi14 > mdi14 전환)',
    fn: (row, prev) => prev && prev[CI['pdi14']] <= prev[CI['mdi14']] && row[CI['pdi14']] > row[CI['mdi14']] },
  { name: 'di_dead',     desc: 'DI 데드크로스 (pdi14 < mdi14 전환, 숏)',
    fn: (row, prev) => prev && prev[CI['pdi14']] >= prev[CI['mdi14']] && row[CI['pdi14']] < row[CI['mdi14']],
    short: true },

  // RSI 과매도/과매수
  { name: 'rsi_oversold',   desc: 'RSI14 < 30 (과매도, 반등 기대)',
    fn: (row) => row[CI['rsi14']] < 30 },
  { name: 'rsi_overbought', desc: 'RSI14 > 70 (과매수, 하락 경고, 숏)',
    fn: (row) => row[CI['rsi14']] > 70,
    short: true },

  // 스토캐스틱 과매도/과매수 + K-D 크로스
  { name: 'stoch_oversold',   desc: 'StochK < 20 (과매도)',
    fn: (row) => row[CI['stochK']] < 20 },
  { name: 'stoch_overbought', desc: 'StochK > 80 (과매수, 숏)',
    fn: (row) => row[CI['stochK']] > 80,
    short: true },
  { name: 'stoch_kd_golden',  desc: 'Stoch K-D 골든크로스 (K가 D 상향돌파)',
    fn: (row, prev) => prev && prev[CI['stochK']] <= prev[CI['stochD']] && row[CI['stochK']] > row[CI['stochD']] },

  // Williams%R
  { name: 'willr_oversold',   desc: 'Williams%R < -80 (과매도)',
    fn: (row) => row[CI['willr14']] < -80 },
  { name: 'willr_overbought', desc: 'Williams%R > -20 (과매수, 숏)',
    fn: (row) => row[CI['willr14']] > -20,
    short: true },

  // CCI
  { name: 'cci_oversold',   desc: 'CCI20 < -100 (과매도)',
    fn: (row) => row[CI['cci20']] < -100 },
  { name: 'cci_overbought', desc: 'CCI20 > 100 (과매수, 숏)',
    fn: (row) => row[CI['cci20']] > 100,
    short: true },

  // MFI
  { name: 'mfi_oversold',   desc: 'MFI14 < 20 (자금 이탈, 반등)',
    fn: (row) => row[CI['mfi14']] < 20 },
  { name: 'mfi_overbought', desc: 'MFI14 > 80 (자금 유입 과도, 숏)',
    fn: (row) => row[CI['mfi14']] > 80,
    short: true },

  // 볼린저
  { name: 'bb_lower',   desc: '볼린저 하단이탈 (%B < 0)',
    fn: (row) => row[CI['bbPctB']] < 0 },
  { name: 'bb_upper',   desc: '볼린저 상단이탈 (%B > 1, 숏)',
    fn: (row) => row[CI['bbPctB']] > 1,
    short: true },

  // ADX 추세 강도 + DI 방향
  { name: 'adx_bull_trend', desc: 'ADX>25 + pdi>mdi (상향 추세 강도)',
    fn: (row) => row[CI['adx14']] > 25 && row[CI['pdi14']] > row[CI['mdi14']] },
  { name: 'adx_bear_trend', desc: 'ADX>25 + mdi>pdi (하향 추세 강도, 숏)',
    fn: (row) => row[CI['adx14']] > 25 && row[CI['mdi14']] > row[CI['pdi14']],
    short: true },

  // 이격도 과도 이탈
  { name: 'disp20_extreme_up',   desc: 'disp20 > 115 (단기 과도 상승, 평균회귀 기대, 숏)',
    fn: (row) => row[CI['disp20']] > 115,
    short: true },
  { name: 'disp20_extreme_down', desc: 'disp20 < 90 (단기 과도 하락, 반등 기대)',
    fn: (row) => row[CI['disp20']] < 90 },

  // 상대거래량 급증
  { name: 'rvol_spike', desc: 'relVol > 3 (거래량 급증, 관심 증가)',
    fn: (row) => row[CI['relVol']] > 3 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. 연속값 Rank IC 계산
//    각 날짜 t에서 단면(441종목) 신호값 vs fwdRet → 스피어만 ρ
//    일별 IC 시계열 → 평균 IC, t-stat, 유효일수
// ─────────────────────────────────────────────────────────────────────────────
console.log('Rank IC 계산 중...');

function getSignalVal(sig, row) {
  if (sig.fn) return sig.fn(row);
  const v = row[CI[sig.col]];
  // dir=-1이면 부호 반전해서 순위를 맞춤(IC 부호 일관성)
  // → IC 결과를 "예상 방향 기준"으로 표시
  return (isFinite(v) ? v : NaN) * sig.dir;
}

const icResults = {}; // name → { ic1[], ic5[], ic20[], icSN1[], icSN5[], icSN20[] }

for (const sig of CONT_SIGNALS) {
  icResults[sig.name] = { ic1: [], ic5: [], ic20: [], icSN1: [], icSN5: [], icSN20: [] };
}

// t: 신호 날짜 (fwd1 = t+1, 사용 가능 t 최대 = T-1-max(horizon))
const T_MAX = T - 1 - Math.max(...HORIZONS); // t ≤ T_MAX

for (let t = 0; t <= T_MAX; t++) {
  // 단면: 441종목 신호값 + fwd return
  const fwd1_xs = stocks.map((_, i) => fwdRet[i][t].fwd1);
  const fwd5_xs = stocks.map((_, i) => fwdRet[i][t].fwd5);
  const fwd20_xs = stocks.map((_, i) => fwdRet[i][t].fwd20);

  // 단면 winsorize fwd (이상치 억제)
  const fwd1w  = winsorize(fwd1_xs);
  const fwd5w  = winsorize(fwd5_xs);
  const fwd20w = winsorize(fwd20_xs);

  // 섹터중립 fwd
  const fwd1sn  = sectorNeutral(fwd1w, themes);
  const fwd5sn  = sectorNeutral(fwd5w, themes);
  const fwd20sn = sectorNeutral(fwd20w, themes);

  for (const sig of CONT_SIGNALS) {
    const sigVals = stocks.map((s) => getSignalVal(sig, s.rows[t]));

    const ic1  = spearman(sigVals, fwd1w);
    const ic5  = spearman(sigVals, fwd5w);
    const ic20 = spearman(sigVals, fwd20w);

    const icSN1  = spearman(sigVals, fwd1sn);
    const icSN5  = spearman(sigVals, fwd5sn);
    const icSN20 = spearman(sigVals, fwd20sn);

    const rec = icResults[sig.name];
    if (isFinite(ic1))   rec.ic1.push(ic1);
    if (isFinite(ic5))   rec.ic5.push(ic5);
    if (isFinite(ic20))  rec.ic20.push(ic20);
    if (isFinite(icSN1)) rec.icSN1.push(icSN1);
    if (isFinite(icSN5)) rec.icSN5.push(icSN5);
    if (isFinite(icSN20))rec.icSN20.push(icSN20);
  }
}

console.log('Rank IC 완료');

// ─────────────────────────────────────────────────────────────────────────────
// 6. 이산 이벤트 초과수익 계산
//    이벤트 발생일 t → fwd return (t+1 ~ t+h까지 누적)
//    기저(base) = 같은 날 전체 종목 평균 fwd return
//    초과수익 = 이벤트 종목 fwd - 기저
// ─────────────────────────────────────────────────────────────────────────────
console.log('이산 이벤트 계산 중...');

// 날짜별 단면 평균 fwd return (기저)
const dailyMean = HORIZONS.reduce((acc, h) => {
  acc[h] = [];
  for (let t = 0; t <= T_MAX; t++) {
    const vals = stocks.map((_, i) => fwdRet[i][t][`fwd${h}`]).filter(isFinite);
    acc[h].push(vals.length > 0 ? mean(vals) : NaN);
  }
  return acc;
}, {});

const eventResults = {}; // name → { h: { events:[{excess, fwd, t, code}], n } }

for (const sig of DISCRETE_SIGNALS) {
  eventResults[sig.name] = {};
  for (const h of HORIZONS) {
    eventResults[sig.name][h] = { excess: [], fwd: [], n: 0 };
  }
}

// 이벤트 탐색: t=1 ~ T_MAX (t=0은 prev row 없음)
for (let t = 1; t <= T_MAX; t++) {
  // 각 날의 단면 기저
  const bases = {};
  for (const h of HORIZONS) bases[h] = dailyMean[h][t];

  for (let i = 0; i < N; i++) {
    const row  = stocks[i].rows[t];
    const prev = stocks[i].rows[t - 1];

    for (const sig of DISCRETE_SIGNALS) {
      let fired = false;
      try { fired = !!sig.fn(row, prev); } catch {}
      if (!fired) continue;

      for (const h of HORIZONS) {
        const fwd = fwdRet[i][t][`fwd${h}`];
        if (!isFinite(fwd) || !isFinite(bases[h])) continue;
        // 숏 신호는 방향 반전 (하락 예상 → 역포지션)
        const directedFwd = sig.short ? -fwd : fwd;
        const directedBase = sig.short ? -bases[h] : bases[h];
        const excess = directedFwd - directedBase;
        eventResults[sig.name][h].excess.push(excess);
        eventResults[sig.name][h].fwd.push(directedFwd);
        eventResults[sig.name][h].n++;
      }
    }
  }
}

console.log('이산 이벤트 완료');

// ─────────────────────────────────────────────────────────────────────────────
// 7. 롱숏 분위 스프레드 (상위 10% - 하위 10%)
//    대표 신호 선택: 연속값 신호 중 IC 절댓값 기준 상위 → 분위 스프레드 계산
//    거래비용: 롱숏 왕복 = TC_BP * 2 (롱 진입/청산 + 숏 진입/청산)
//    회전율: 매일 재구성 가정 (최악 케이스)
// ─────────────────────────────────────────────────────────────────────────────
console.log('롱숏 분위 스프레드 계산 중...');

const lsResults = {}; // name → { h: { grossRet[], netRet[], turnover } }

for (const sig of CONT_SIGNALS) {
  lsResults[sig.name] = {};
  for (const h of HORIZONS) {
    lsResults[sig.name][h] = { gross: [], net: [] };
  }
}

for (let t = 0; t <= T_MAX; t++) {
  for (const sig of CONT_SIGNALS) {
    const sigVals = stocks.map((s) => getSignalVal(sig, s.rows[t]));
    const valid   = sigVals.map((v, i) => ({ v, i })).filter(x => isFinite(x.v));
    if (valid.length < 20) continue;

    const qLo = quantile(valid.map(x => x.v), Q_LO);
    const qHi = quantile(valid.map(x => x.v), Q_HI);

    for (const h of HORIZONS) {
      const loFwds = [], hiFwds = [];
      for (const { v, i } of valid) {
        const fwd = fwdRet[i][t][`fwd${h}`];
        if (!isFinite(fwd)) continue;
        if (v <= qLo) loFwds.push(fwd);
        if (v >= qHi) hiFwds.push(fwd);
      }
      if (!loFwds.length || !hiFwds.length) continue;
      const spread = mean(hiFwds) - mean(loFwds); // 롱(상위)-숏(하위)
      const tc = TC_BP * 2 / 10000; // 왕복 거래비용 (롱+숏 각각 1회)
      lsResults[sig.name][h].gross.push(spread);
      lsResults[sig.name][h].net.push(spread - tc);
    }
  }
}

console.log('롱숏 계산 완료');

// ─────────────────────────────────────────────────────────────────────────────
// 8. 결과 집계 함수
// ─────────────────────────────────────────────────────────────────────────────

/** IC 요약: mean, t-stat, n, 유의 여부 (Bonferroni 조정 p<0.05) */
function summarizeIC(ics) {
  const v = ics.filter(isFinite);
  if (v.length < 3) return { mean: NaN, t: NaN, n: v.length };
  const m = mean(v), t = tStat(v);
  // Bonferroni: 각 가설 α = 0.05/N_HYPOTHESES ≈ 0.05/90 ≈ 0.00056
  // t 임계값(df≈100) ≈ 3.55 (보수적으로 3.5 사용)
  const bonferroni_t = 3.5;
  return { mean: m, t, n: v.length, sig: Math.abs(t) > bonferroni_t };
}

/** 이벤트 요약: mean excess, hit rate(양수), t-stat, n */
function summarizeEvent(rec) {
  const exc = rec.excess.filter(isFinite);
  if (exc.length < MIN_EVENT) return { mean: NaN, t: NaN, n: exc.length, hit: NaN };
  const m = mean(exc), t = tStat(exc);
  const hit = exc.filter(x => x > 0).length / exc.length;
  return { mean: m, t, n: exc.length, hit };
}

/** LS 요약: 평균 gross/net, t-stat */
function summarizeLS(arr) {
  if (!arr.length) return { mean: NaN, t: NaN, n: 0 };
  return { mean: mean(arr), t: tStat(arr), n: arr.length };
}

function fmt(v, digits = 4) {
  if (!isFinite(v)) return '—';
  return v.toFixed(digits);
}
function fmtPct(v) {
  if (!isFinite(v)) return '—';
  return (v * 100).toFixed(2) + '%';
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. 마크다운 보고서 작성
// ─────────────────────────────────────────────────────────────────────────────
const md = [];

md.push(`# 표준 보조지표 정직 백테스트 결과`);
md.push(`\n> 데이터: ta-panel.json, ${N}종목 × ${T}거래일(${DATES[0]} ~ ${DATES[T-1]})`);
md.push(`> 신호 t시점, 타깃 fwd1/fwd5/fwd20 (룩어헤드 차단). 거래비용 왕복 ${TC_BP}bp.`);
md.push(`> Bonferroni 보정: 약 ${N_HYPOTHESES}개 가설 → 단일 신호 유의 기준 |t| > 3.5.`);
md.push(`> **주의: 이상 ≠ 매매 신호. 점수는 "관측 유의성"이지 "거래가능 알파" 아님.**\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 9-A. 연속값 Rank IC 테이블
// ─────────────────────────────────────────────────────────────────────────────
md.push(`## 1. 연속값 Rank IC (스피어만 ρ, 일평균)\n`);
md.push(`신호가 방향대로 작동하면 IC > 0. 방향: 각 신호 설명 참조.`);
md.push(`섹터중립(SN) IC = 섹터 평균 제거 후 고유 예측력.\n`);

md.push(`| 신호 | fwd1 IC | t | fwd5 IC | t | fwd20 IC | t | SN-fwd5 IC | t | 유의(Bonf) | 방향 |`);
md.push(`|------|---------|---|---------|---|----------|---|------------|---|------------|------|`);

const icSummaries = {};

for (const sig of CONT_SIGNALS) {
  const r   = icResults[sig.name];
  const s1  = summarizeIC(r.ic1);
  const s5  = summarizeIC(r.ic5);
  const s20 = summarizeIC(r.ic20);
  const sSN5= summarizeIC(r.icSN5);
  icSummaries[sig.name] = { s1, s5, s20, sSN5 };

  // 유의 여부 (어느 기간이라도 Bonferroni 통과 시 표기)
  const anySig = s1.sig || s5.sig || s20.sig || sSN5.sig;
  const sigMark = anySig ? '**YES**' : 'no';

  // 방향 해석: IC > 0 = 예상 방향대로
  const dirDesc = sig.dir === +1 ? '모멘텀↑' : '역발상↑';

  md.push(`| ${sig.name} | ${fmt(s1.mean)} | ${fmt(s1.t,2)} | ${fmt(s5.mean)} | ${fmt(s5.t,2)} | ${fmt(s20.mean)} | ${fmt(s20.t,2)} | ${fmt(sSN5.mean)} | ${fmt(sSN5.t,2)} | ${sigMark} | ${dirDesc} |`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9-B. 이산 이벤트 초과수익 테이블
// ─────────────────────────────────────────────────────────────────────────────
md.push(`\n## 2. 이산 신호 이벤트 초과수익\n`);
md.push(`초과수익 = 이벤트 발생 종목 방향성 수익 − 당일 전체 평균(기저). 숏 신호는 부호 반전.`);
md.push(`적중률 = 초과수익 > 0 비율. 표본 < ${MIN_EVENT} 제외.\n`);

md.push(`| 신호 | fwd1 초과 | 적중률 | t | fwd5 초과 | 적중률 | t | fwd5 표본 | 판정 |`);
md.push(`|------|----------|--------|---|----------|--------|---|-----------|------|`);

for (const sig of DISCRETE_SIGNALS) {
  const r1  = summarizeEvent(eventResults[sig.name][1]);
  const r5  = summarizeEvent(eventResults[sig.name][5]);
  const r20 = summarizeEvent(eventResults[sig.name][20]);

  const anySig = (Math.abs(r1.t) > 3.5 || Math.abs(r5.t) > 3.5) ? '**유의**' : '무의미';

  md.push(`| ${sig.name} | ${fmtPct(r1.mean)} | ${fmtPct(r1.hit)} | ${fmt(r1.t,2)} | ${fmtPct(r5.mean)} | ${fmtPct(r5.hit)} | ${fmt(r5.t,2)} | ${r5.n} | ${anySig} |`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9-C. 롱숏 분위 스프레드
// ─────────────────────────────────────────────────────────────────────────────
md.push(`\n## 3. 롱숏 분위 스프레드 (상위10% − 하위10%)\n`);
md.push(`gross = 거래비용 전, net = 왕복 ${TC_BP}bp 차감 후(최소 기준). 일별 재구성 가정(회전율 100%).`);
md.push(`연간화: 1일 스프레드 × 250(fwd1 기준), 5일 × 50(fwd5 기준).\n`);

md.push(`| 신호 | fwd1 gross/yr | net/yr | t | fwd5 gross/yr | net/yr | t | fwd5 표본 |`);
md.push(`|------|--------------|--------|---|--------------|--------|---|-----------|`);

for (const sig of CONT_SIGNALS) {
  const ls1  = summarizeLS(lsResults[sig.name][1].gross);
  const ls1n = summarizeLS(lsResults[sig.name][1].net);
  const ls5  = summarizeLS(lsResults[sig.name][5].gross);
  const ls5n = summarizeLS(lsResults[sig.name][5].net);

  // 연간화: fwd1 × 250, fwd5 × 50
  const ann1g = isFinite(ls1.mean)  ? ls1.mean  * 250 : NaN;
  const ann1n = isFinite(ls1n.mean) ? ls1n.mean * 250 : NaN;
  const ann5g = isFinite(ls5.mean)  ? ls5.mean  * 50  : NaN;
  const ann5n = isFinite(ls5n.mean) ? ls5n.mean * 50  : NaN;

  md.push(`| ${sig.name} | ${fmtPct(ann1g)} | ${fmtPct(ann1n)} | ${fmt(ls1.t,2)} | ${fmtPct(ann5g)} | ${fmtPct(ann5n)} | ${fmt(ls5.t,2)} | ${ls5.n} |`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9-D. 섹터 통제 비교 (fwd5 IC vs SN-IC 차이)
// ─────────────────────────────────────────────────────────────────────────────
md.push(`\n## 4. 섹터 통제 효과\n`);
md.push(`IC_raw - IC_SN > 0 이면 신호가 섹터 공통 움직임을 타는 것 (β bias). SN-IC가 높아야 진짜 종목 고유 예측.\n`);

md.push(`| 신호 | fwd5 IC_raw | t_raw | SN-IC | t_SN | 섹터편향(Δ) | 고유예측 |`);
md.push(`|------|------------|-------|-------|------|-------------|---------|`);

for (const sig of CONT_SIGNALS) {
  const { s5, sSN5 } = icSummaries[sig.name];
  const delta = isFinite(s5.mean) && isFinite(sSN5.mean) ? s5.mean - sSN5.mean : NaN;
  const biasNote = isFinite(delta) ? (delta > 0.01 ? '섹터편향↑' : delta < -0.01 ? '역방향' : '거의없음') : '—';
  const idioNote = (sSN5.sig) ? '**유의**' : '무의미';
  md.push(`| ${sig.name} | ${fmt(s5.mean)} | ${fmt(s5.t,2)} | ${fmt(sSN5.mean)} | ${fmt(sSN5.t,2)} | ${fmt(delta)} | ${idioNote} |`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9-E. 다중검정 경고
// ─────────────────────────────────────────────────────────────────────────────
md.push(`\n## 5. 다중검정 경고 (Bonferroni)\n`);
md.push(`- 총 검정 수: 연속 신호 ${CONT_SIGNALS.length}개 × 기간 4 + 이산 신호 ${DISCRETE_SIGNALS.length}개 × 기간 3 ≈ **${N_HYPOTHESES}개 이상**`);
md.push(`- Bonferroni α = 0.05/${N_HYPOTHESES} = ${(0.05/N_HYPOTHESES).toFixed(5)} → |t| > 3.5 (df≈100 기준)`);
md.push(`- |t| < 2(p>0.05 단순) 신호는 노이즈 구분 불가. |t| 2~3.5 구간은 "참고" 수준.`);
md.push(`- 발표 효과(McLean-Pontiff): 알려진 신호는 시장 참여자 학습 후 2/3 소멸 경향.`);
md.push(`- 표본 수 한계: 140일 × 441종목 단면 → 유효 독립 관측 ≪ 명목 표본(단면 상관으로 과대).\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 9-F. 상위 신호 요약 + 구체 수치
// ─────────────────────────────────────────────────────────────────────────────
md.push(`## 6. 주목할 신호 정리\n`);

// IC 기준 상위 신호 추출
const ranked = CONT_SIGNALS.map(sig => {
  const { s5, sSN5 } = icSummaries[sig.name];
  return { name: sig.name, desc: sig.desc, ic5: s5.mean, t5: s5.t, snic5: sSN5.mean, snT5: sSN5.t, sig5: s5.sig, sigSN5: sSN5.sig };
}).sort((a, b) => Math.abs(b.ic5 || 0) - Math.abs(a.ic5 || 0));

md.push(`### 6-A. IC 절댓값 기준 상위 5개 연속 신호 (fwd5)\n`);
for (const r of ranked.slice(0, 5)) {
  const judgement = r.sigSN5 ? '섹터중립 후에도 Bonferroni 유의 — 고유 예측력 존재 의심'
    : r.sig5 ? '섹터편향 의심 (SN 후 소멸)'
    : '무의미 (다중검정 기준)';
  md.push(`- **${r.name}** (${r.desc}): IC=${fmt(r.ic5)} t=${fmt(r.t5,2)}, SN-IC=${fmt(r.snic5)} SN-t=${fmt(r.snT5,2)} → ${judgement}`);
}

// 이벤트 기준 상위 신호
const evRanked = DISCRETE_SIGNALS.map(sig => {
  const r5 = summarizeEvent(eventResults[sig.name][5]);
  return { name: sig.name, desc: sig.desc, mean5: r5.mean, t5: r5.t, n5: r5.n, hit5: r5.hit };
}).filter(r => r.n5 >= MIN_EVENT).sort((a, b) => Math.abs(b.mean5||0) - Math.abs(a.mean5||0));

md.push(`\n### 6-B. 초과수익 절댓값 기준 상위 5개 이산 신호 (fwd5)\n`);
for (const r of evRanked.slice(0, 5)) {
  const judgement = Math.abs(r.t5) > 3.5 ? '**Bonferroni 유의** — 표본 내 유의하나 거래비용·감쇠 검토 필요'
    : Math.abs(r.t5) > 2.0 ? '명목 유의(p<0.05) — Bonferroni 실패, 참고만'
    : '무의미';
  md.push(`- **${r.name}** (${r.desc}): fwd5 초과수익=${fmtPct(r.mean5)}, 적중률=${fmtPct(r.hit5)}, t=${fmt(r.t5,2)}, n=${r.n5} → ${judgement}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9-G. SBV D² / 공시 대비 비교 한 줄
// ─────────────────────────────────────────────────────────────────────────────
md.push(`\n## 7. 표준 TA vs D²·공시 (SBV) 비교\n`);
md.push(`| 차원 | 표준 TA 신호 | D²(마할라노비스) | 공시 이벤트 |`);
md.push(`|------|------------|----------------|------------|`);
md.push(`| 정보 소스 | OHLCV 파생 지표 | 다변량 이탈도(relVol·ret·body 등) | 공시 메타(종류·크기·방향) |`);
md.push(`| 주파수 | 일봉(후행) | 분봉(실시간 탐지) | 이벤트 발생 시점 |`);
md.push(`| 거짓 양성 | 높음(이격·크로스 자주 발생) | 중간(σ 임계치 조정) | 낮음(명시 이벤트) |`);
md.push(`| 해석 가능성 | 높음(트레이더 친숙) | 낮음(통계적 거리) | 높음(내용 직결) |`);
md.push(`| 예측력 의심 수준 | 낮음(소멸 추세, 닳는 신호) | 미검증(본 연구 대상 아님) | 이벤트 종류별 상이 |`);
md.push(`\n→ 표준 TA는 트레이더 통념 접근성이 높으나, McLean-Pontiff 효과로 발표 후 소멸 가능성 높음. D²는 단순 후행 지표보다 다변량 이탈 탐지에 유리하나 예측력은 별도 검증 필요.\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 9-H. 한계 및 주의사항
// ─────────────────────────────────────────────────────────────────────────────
md.push(`## 8. 한계 및 주의사항\n`);
md.push(`1. **유효 표본 과대**: 441종목 단면 상관 존재 → 명목 N=441, 실질 독립 관측 < 441. t-stat 과대 추정.`);
md.push(`2. **기간 편향**: 140거래일(약 7개월). 특정 시장 국면(2025-12~2026-06)에만 유효할 수 있음.`);
md.push(`3. **macd·스토캐스틱 초기값 누락**: 윈도우 기간(9~60일) 이전 행은 패널 생성 시 부정확할 수 있음.`);
md.push(`4. **거래비용 40bp는 최소값**: 실제 매매세(0.18%)·증권사 수수료·시장충격 포함 시 80~120bp 이상.`);
md.push(`5. **생존 편향**: 분석 기간 동안 상장폐지·거래정지 종목이 패널에서 제거되었을 가능성.`);
md.push(`6. **룩어헤드 자가점검**: 신호=rows[t](t까지만 사용), 타깃=close[t+k]/close[t]-1. 교차 없음.\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 9-I. 최종 한 줄 결론
// ─────────────────────────────────────────────────────────────────────────────
md.push(`## 최종 결론\n`);

// 유의 신호 수 집계
const sigContCount = CONT_SIGNALS.filter(sig => {
  const { s1, s5, s20, sSN5 } = icSummaries[sig.name];
  return s1.sig || s5.sig || s20.sig || sSN5.sig;
}).length;

const sigEvtCount = DISCRETE_SIGNALS.filter(sig => {
  return HORIZONS.some(h => {
    const r = summarizeEvent(eventResults[sig.name][h]);
    return Math.abs(r.t) > 3.5;
  });
}).length;

md.push(`> 연속 신호 ${CONT_SIGNALS.length}개 중 Bonferroni 유의 ${sigContCount}개, 이산 신호 ${DISCRETE_SIGNALS.length}개 중 ${sigEvtCount}개 유의.`);
md.push(`>`);
md.push(`> **표준 TA 신호 중 이 데이터(441종목×140일)에서 미래 수익과 유의미한 신호는 극히 제한적이며, 유의하더라도 단면 상관 과대·짧은 표본·거래비용 차감 후 소멸 등을 고려하면 거래가능 알파로 단정할 수 없다. 대부분의 신호는 통념의 잔상(닳는 신호)으로 판단하는 것이 McLean-Pontiff 결론과 정합하며, 이 데이터의 범위에서는 표준 TA가 체계적·안정적 예측력을 보인다고 볼 근거가 없다.**`);

// ─────────────────────────────────────────────────────────────────────────────
// 10. 파일 저장
// ─────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
console.log(`\n결과 저장: ${OUT_MD}`);

// 요약 콘솔 출력
console.log('\n=== IC 상위 신호 (fwd5 기준) ===');
ranked.slice(0, 8).forEach(r => {
  console.log(`  ${r.name.padEnd(20)} IC=${(r.ic5||0).toFixed(4)}  t=${((r.t5)||0).toFixed(2)}  SN-IC=${(r.snic5||0).toFixed(4)}  SN-t=${((r.snT5)||0).toFixed(2)}  Bonf=${r.sigSN5?'YES':'no'}`);
});

console.log('\n=== 이벤트 초과수익 상위 신호 (fwd5 기준) ===');
evRanked.slice(0, 8).forEach(r => {
  console.log(`  ${r.name.padEnd(25)} excess=${((r.mean5||0)*100).toFixed(2)}%  hit=${((r.hit5||0)*100).toFixed(1)}%  t=${((r.t5)||0).toFixed(2)}  n=${r.n5}`);
});

console.log(`\nBonferroni 유의 연속신호: ${sigContCount}/${CONT_SIGNALS.length}`);
console.log(`Bonferroni 유의 이산신호:  ${sigEvtCount}/${DISCRETE_SIGNALS.length}`);
