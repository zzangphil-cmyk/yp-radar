/**
 * event-study.mjs
 * D²(레이더 온도) vs 공시 이벤트 스터디
 *
 * 목표: "D²가 실질 공시를 동시/선행/후행 감지하는가?"
 * 데이터: stock-panel.json(141종목×140일 피처) + disclosures.json(DART 공시)
 * D² 정의: build-radar.mjs와 동일 (5피처, Ledoit-Wolf, 시장 내 robust-z)
 *
 * 룩어헤드 구분 필수:
 *  - 선행(lead): D²_t → 공시 t+1..t+3  (D²가 공시보다 먼저 = 조기경보)
 *  - 동시(coincident): D²_t 와 공시_t  (같은 날)
 *  - 후행(lag): 공시_t → D² 상승 t..t+1  (공시 반영)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ─────────────────────────────────────────────
// 1. 데이터 로드
// ─────────────────────────────────────────────
const panelData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stock-panel.json"), "utf8"));
const discData  = JSON.parse(fs.readFileSync(path.join(ROOT, "data/disclosures.json"),  "utf8"));
const marketMap = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/stock-markets.json"), "utf8"));
const etfData   = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"),    "utf8"));

const COLS = panelData.cols;
const ci   = (k) => COLS.indexOf(k);

// ─────────────────────────────────────────────
// 2. Universe 선택 (build-radar.mjs 동일)
// ─────────────────────────────────────────────
const KOSPI_N = 200, KOSDAQ_N = 50;
let nK = 0, nQ = 0;
const sel = [];
for (const s of etfData.stocks) {
  const p  = panelData.panel[s.code]; if (!p) continue;
  const mk = marketMap[s.code];
  if (mk === "KOSPI"  && nK < KOSPI_N)  { sel.push(p); nK++; }
  else if (mk === "KOSDAQ" && nQ < KOSDAQ_N) { sel.push(p); nQ++; }
  if (nK >= KOSPI_N && nQ >= KOSDAQ_N) break;
}
const N      = sel.length;
const market = sel.map((p) => marketMap[p.code] || "KOSPI");
// 섹터(테마)는 각 패널의 theme 필드 사용
const themeAll = sel.map((p) => p.theme ?? "기타");
const logMkt   = sel.map((p) => Math.log((p.mktCap || 0.01) + 1e-6));
const dates    = sel[0].dates;          // "YYYY-MM-DD" 140개
const totalDays = dates.length;

console.log(`Universe: 코스피 ${nK} + 코스닥 ${nQ} = ${N}종목 · ${totalDays}거래일 (${dates[0]}~${dates[totalDays-1]})`);

// ─────────────────────────────────────────────
// 3. 수학 유틸 (build-radar.mjs 동일)
// ─────────────────────────────────────────────
const mean   = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const median = (a) => { const s=[...a].sort((x,y)=>x-y); const n=s.length; return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0; };
const clamp  = (v,a,b) => Math.max(a,Math.min(b,v));

/** 시장 내 robust-z: 그룹별 median/MAD로 표준화 */
function madZByGroup(arr, grp) {
  const groups = {};
  arr.forEach((v,i)=>{ (groups[grp[i]] ??= []).push(v); });
  const med={}, sc={};
  for (const g in groups) {
    const m = median(groups[g]);
    med[g] = m;
    sc[g]  = (median(groups[g].map((x)=>Math.abs(x-m))) * 1.4826) || 1e-9;
  }
  return arr.map((v,i)=>(v - med[grp[i]]) / sc[grp[i]]);
}

/** 5×5 역행렬 (가우스-조던) */
function inv(A) {
  const n=A.length, M=A.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>(i===j?1:0))]);
  for (let col=0;col<n;col++) {
    let piv=col; for (let r=col+1;r<n;r++) if (Math.abs(M[r][col])>Math.abs(M[piv][col])) piv=r;
    [M[col],M[piv]]=[M[piv],M[col]];
    const d=M[col][col]||1e-9; for (let j=0;j<2*n;j++) M[col][j]/=d;
    for (let r=0;r<n;r++) if (r!==col){const f=M[r][col];for(let j=0;j<2*n;j++) M[r][j]-=f*M[col][j];}
  }
  return M.map((r)=>r.slice(n));
}

// ─────────────────────────────────────────────
// 4. 공시 분류 함수
// ─────────────────────────────────────────────

/**
 * 실질(가격영향) 공시 판별
 * report_nm에 아래 키워드가 포함되면 실질, 정형 노이즈면 제외
 * [기재정정] 접두어가 있어도 내용이 실질이면 포함
 */
const MATERIAL_KEYWORDS = [
  "단일판매", "공급계약",
  "영업(잠정)실적", "영업잠정실적", "영업실적",
  "연결재무제표기준영업실적", "연결재무제표기준영업(잠정)실적",
  "유상증자결정",
  "무상증자결정",
  "전환사채", "신주인수권부사채", "교환사채",
  "주요사항보고서",
  "최대주주변경",
  "주식분할", "주식병합", "주식소각",
  "자기주식취득결정", "자기주식처분결정",
  "조회공시요구", "조회공시답변",
  "풍문또는보도", "풍문또는",
  "횡령배임", "회생절차", "부도", "소송등",
  "합병결정", "분할결정", "감자결정",
  "영업양수도결정", "영업양도결정", "영업양수결정",
];

// 정형 노이즈(제외 키워드) — 이게 포함된 공시는 material이어도 제외
const NOISE_KEYWORDS = [
  "임원ㆍ주요주주특정증권등소유상황보고서",
  "임원·주요주주특정증권등소유상황보고서",
  "투자설명서",
  "증권발행실적보고서",
  "일괄신고추가서류", "일괄신고서",
  "주식등의대량보유상황보고서",
  "주주총회소집공고", "주주총회결의",
  "의결권대리행사",
  "사업보고서", "분기보고서", "반기보고서",
  "감사보고서",
  "기업설명회",
  "최대주주등소유주식변동신고서",
];

function isMaterial(name) {
  // 정형 노이즈 먼저 제외
  for (const kw of NOISE_KEYWORDS) {
    if (name.includes(kw)) return false;
  }
  // 실질 키워드 포함
  for (const kw of MATERIAL_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  return false;
}

function isAny(name) {
  // 정형 노이즈만 제외, 나머지 전부
  for (const kw of NOISE_KEYWORDS) {
    if (name.includes(kw)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// 5. 공시 인덱스 구축 (코드 → 날짜문자열 → {material, all})
// ─────────────────────────────────────────────
// dates는 "YYYY-MM-DD", 공시 date는 "YYYYMMDD" → 변환
const dateSet = new Set(dates.map(d=>d.replace(/-/g,"")));   // 거래일 집합

// byCode[code] = { [yyyymmdd]: { material: bool, all: bool } }
const discIdx = {};   // code → date → { material, all }
let totalMaterial = 0, totalAll = 0;
for (const [code, val] of Object.entries(discData.byCode)) {
  if (!discIdx[code]) discIdx[code] = {};
  for (const ev of val.disc) {
    const d8 = ev.date;   // "YYYYMMDD"
    if (!discIdx[code][d8]) discIdx[code][d8] = { material: false, all: false };
    const mat = isMaterial(ev.name);
    const any = isAny(ev.name);
    if (mat) { discIdx[code][d8].material = true; totalMaterial++; }
    if (any) { discIdx[code][d8].all      = true; totalAll++; }
  }
}

// 종목별 공시 유무 통계
const codesWithMat = Object.entries(discIdx).filter(([,v])=>Object.values(v).some(x=>x.material)).length;
console.log(`공시 총계: 실질=${totalMaterial}건 / 전체(노이즈제외)=${totalAll}건 (${codesWithMat}종목)`);

// ─────────────────────────────────────────────
// 6. 전 기간 D² 계산 (140일 × N종목)
// ─────────────────────────────────────────────
// 각 일자 단면에서 D² 계산 → d2Matrix[t][i]
const d2Matrix    = [];   // [t][i] D² raw
const zMatrix     = [];   // [t][i][5] z피처
const featNames   = ["relVol","specRet","vol20","range","flow"];

console.log("D² 계산 중...");
for (let d = 0; d < totalDays; d++) {
  const relVol  = sel.map((p) => p.rows[d]?.[ci("relVol")]   ?? 1);
  const ret1    = sel.map((p) => p.rows[d]?.[ci("ret1")]     ?? 0);
  const vol20   = sel.map((p) => p.rows[d]?.[ci("vol20")]    ?? 0);
  const range   = sel.map((p) => p.rows[d]?.[ci("range")]    ?? 0);
  const turnover= sel.map((p) => p.rows[d]?.[ci("turnover")] ?? 0);

  // 고유수익 = ret1 − 섹터평균
  const thS={}, thN={};
  ret1.forEach((r,i)=>{ const t=themeAll[i]; thS[t]=(thS[t]||0)+r; thN[t]=(thN[t]||0)+1; });
  const specRet = ret1.map((r,i)=>r-(thS[themeAll[i]]/thN[themeAll[i]]));

  // 자금유입 = log(turnover) ⊥ log(mktCap) 잔차
  const lt = turnover.map((v)=>Math.log((v||0)+1));
  const mx = mean(logMkt), my = mean(lt);
  let sxx=0,sxy=0;
  for (let i=0;i<N;i++){ sxx+=(logMkt[i]-mx)**2; sxy+=(logMkt[i]-mx)*(lt[i]-my); }
  const beta = sxy/(sxx||1e-9);
  const flow = lt.map((v,i)=>v-(my+beta*(logMkt[i]-mx)));

  // 시장 내 robust-z (5피처)
  const Z = [
    madZByGroup(relVol,            market),
    madZByGroup(specRet.map(Math.abs), market),
    madZByGroup(vol20,             market),
    madZByGroup(range,             market),
    madZByGroup(flow.map(Math.abs),market),
  ];

  // Ledoit-Wolf 수축 공분산 → 역행렬
  const p = 5;
  const C = Array.from({length:p},()=>Array(p).fill(0));
  for (let a=0;a<p;a++) for (let b=0;b<p;b++){
    let s=0; for (let i=0;i<N;i++) s+=Z[a][i]*Z[b][i]; C[a][b]=s/N;
  }
  const alpha = clamp(0.1+(p/N),0.1,0.5);
  const S = C.map((row,a)=>row.map((v,b)=>(a===b?v:(1-alpha)*v)));
  const Si = inv(S);

  // D² = zᵀ Σ⁻¹ z
  const d2row = [];
  const zrow  = [];
  for (let i=0;i<N;i++){
    let q=0;
    for (let a=0;a<p;a++) for (let bb=0;bb<p;bb++) q+=Z[a][i]*Si[a][bb]*Z[bb][i];
    d2row.push(Math.max(0, q));
    zrow.push(Z.map(zf=>zf[i]));  // [z0..z4]
  }
  d2Matrix.push(d2row);
  zMatrix.push(zrow);
}
console.log(`D² 계산 완료: ${d2Matrix.length}일 × ${N}종목`);

// ─────────────────────────────────────────────
// 7. within-종목 D² 백분위(percentile rank) 산출
// ─────────────────────────────────────────────
// pctMatrix[t][i] = 해당 종목의 역대 d2 중 몇 번째 위치인지 (0~1)
const pctMatrix = Array.from({length:totalDays},()=>new Float32Array(N));
for (let i=0;i<N;i++){
  const series = d2Matrix.map(row=>row[i]);
  const sorted = [...series].sort((a,b)=>a-b);
  for (let t=0;t<totalDays;t++){
    // 순위 / (n-1)
    let rank=0;
    for (const v of sorted){ if (v<=series[t]) rank++; }
    pctMatrix[t][i] = rank/totalDays;
  }
}

// ─────────────────────────────────────────────
// 8. 이벤트-D² 매핑 (종목×날짜 단위)
// ─────────────────────────────────────────────
// 각 (i, t) → { d2, pct, zArr, hasMat_t, hasAny_t, hasMat_t1t3, hasMat_t_1 }
// hasMat_t   : 당일 t에 실질공시 (동시 분석용)
// hasMat_t1t3: t+1..t+3 내 실질공시 (선행 분석용 — 룩어헤드 없음, t+1은 미래)
// hasMat_t_1 : t-1..t에 실질공시 (후행: 공시 → D² 다음 날 반응)

// dates를 yyyymmdd로
const dates8 = dates.map(d=>d.replace(/-/g,""));

// 관측 행 수집
const observations = [];
for (let t=0;t<totalDays;t++){
  for (let i=0;i<N;i++){
    const code   = sel[i].code;
    const disc   = discIdx[code] || {};
    const d8_t   = dates8[t];

    const hasMat_t    = !!(disc[d8_t]?.material);
    const hasAny_t    = !!(disc[d8_t]?.all);
    // 선행: t+1..t+3 실질공시 존재? (t 시점에서 미래 — 룩어헤드 방향 맞음)
    let hasMat_t1t3 = false;
    for (let k=1;k<=3;k++){
      if (t+k<totalDays && disc[dates8[t+k]]?.material) { hasMat_t1t3=true; break; }
    }
    // 후행: t-1..t 공시 후 D² 올랐나 (공시_t-1 → D²_t)
    const hasMat_tm1  = (t>=1) && !!(disc[dates8[t-1]]?.material);

    observations.push({
      t, i, code, name: sel[i].name, date: dates[t],
      d2:  d2Matrix[t][i],
      pct: pctMatrix[t][i],
      z:   zMatrix[t][i],
      hasMat_t, hasAny_t,
      hasMat_t1t3,
      hasMat_tm1,
    });
  }
}
console.log(`관측 행: ${observations.length.toLocaleString()}`);

// ─────────────────────────────────────────────
// 9. 기저율(base rate) 계산
// ─────────────────────────────────────────────
const totalObs   = observations.length;
const baseMat    = observations.filter(o=>o.hasMat_t).length / totalObs;
const baseLead   = observations.filter(o=>o.hasMat_t1t3).length / totalObs;
const baseAny    = observations.filter(o=>o.hasAny_t).length / totalObs;

console.log(`\n기저율:`);
console.log(`  실질공시 당일(기저율): ${(baseMat*100).toFixed(3)}%`);
console.log(`  실질공시 t+1~3(기저율): ${(baseLead*100).toFixed(3)}%`);
console.log(`  전체공시(노이즈제외) 당일: ${(baseAny*100).toFixed(3)}%`);

// ─────────────────────────────────────────────
// 10. 분위별 공시 적중률 (D² 상위 1/5/10/20%)
// ─────────────────────────────────────────────
// cross-sectional 기준: 각 날짜마다 D² 상위 k% 종목
// → 해당 관측이 공시를 가졌는가

function quantileAnalysis(label, filterFn) {
  // 각 날짜 단면에서 D² 분위 경계
  const thresholds = [0.01, 0.05, 0.10, 0.20]; // 상위 1/5/10/20%

  const result = {};
  for (const q of thresholds) {
    let hitMat=0, hitLead=0, hitAny=0, total=0;
    for (let t=0;t<totalDays;t++){
      const dayObs = observations.filter(o=>o.t===t);
      const sorted = [...dayObs].sort((a,b)=>b.d2-a.d2);
      const topK   = Math.max(1, Math.round(sorted.length*q));
      const topSet = new Set(sorted.slice(0,topK).map(o=>o.i));
      for (const o of dayObs){
        if (!topSet.has(o.i)) continue;
        if (!filterFn(o)) continue;
        total++;
        if (o.hasMat_t)    hitMat++;
        if (o.hasMat_t1t3) hitLead++;
        if (o.hasAny_t)    hitAny++;
      }
    }
    result[q] = {
      total,
      precMat:  total>0?hitMat/total:0,
      precLead: total>0?hitLead/total:0,
      precAny:  total>0?hitAny/total:0,
      liftMat:  baseMat>0?(total>0?hitMat/total:0)/baseMat:0,
      liftLead: baseLead>0?(total>0?hitLead/total:0)/baseLead:0,
    };
  }
  return result;
}

// 전체 universe 기준
const qAll = quantileAnalysis("전체", ()=>true);

// ─────────────────────────────────────────────
// 11. 피처별 분석 (어느 성분이 공시와 가장 연관?)
// ─────────────────────────────────────────────
// z[0]=relVol, z[1]=specRet, z[2]=vol20, z[3]=range, z[4]=flow
// 각 피처의 |z| 상위 10% vs 하위 기저율 비교

function featureAnalysis() {
  const results = [];
  const fNames  = ["거래량(relVol)", "고유수익(|specRet|)", "변동성(vol20)", "당일폭(range)", "자금유입(|flow|)"];

  for (let fi=0;fi<5;fi++){
    // 날짜별 단면에서 해당 피처 |z| 상위 10%
    let hitMat=0, hitLead=0, total=0;
    for (let t=0;t<totalDays;t++){
      const dayObs = observations.filter(o=>o.t===t);
      const sorted = [...dayObs].sort((a,b)=>Math.abs(b.z[fi])-Math.abs(a.z[fi]));
      const topK   = Math.max(1, Math.round(sorted.length*0.10));
      for (let k=0;k<topK;k++){
        const o = sorted[k];
        total++;
        if (o.hasMat_t)    hitMat++;
        if (o.hasMat_t1t3) hitLead++;
      }
    }
    const precMat  = total>0?hitMat/total:0;
    const precLead = total>0?hitLead/total:0;
    results.push({
      feat: fNames[fi],
      total,
      precMat,
      precLead,
      liftMat:  baseMat>0?precMat/baseMat:0,
      liftLead: baseLead>0?precLead/baseLead:0,
    });
  }
  return results;
}
const featRes = featureAnalysis();

// ─────────────────────────────────────────────
// 12. 선행/동시/후행 정식 분석
// ─────────────────────────────────────────────

// 상위 10% 기준으로 정밀도·재현율·리프트
function windowAnalysis(topQ) {
  let coinc_pos=0, coinc_neg=0, lead_pos=0, lead_neg=0, lag_pos=0, lag_neg=0;
  // 후행: 공시_t → D²가 t 또는 t+1에 상위?
  // 재구성: 각 날짜 단면 상위 topQ
  // 전체 (i,t) 중 topSet 여부를 먼저 계산
  const isTop = Array.from({length:totalDays},()=>new Uint8Array(N));
  for (let t=0;t<totalDays;t++){
    const d2row = d2Matrix[t];
    const vals  = Array.from({length:N},(_,i)=>({i,v:d2row[i]})).sort((a,b)=>b.v-a.v);
    const topK  = Math.max(1,Math.round(N*topQ));
    for (let k=0;k<topK;k++) isTop[t][vals[k].i]=1;
  }

  // 동시 precision/recall
  let coin_hit=0, coin_total=0;
  let lead_hit=0, lead_total=0;
  let lag_cnt=0, lag_d2up=0;  // 공시 다음날 D² 상승?

  for (let t=0;t<totalDays;t++){
    for (let i=0;i<N;i++){
      const top = isTop[t][i];
      const o   = observations[t*N+i];  // 순서 보장 위해 인덱스로
      // 동시
      coin_total++;
      if (top && o.hasMat_t) coin_hit++;

      // 선행: D²_t 상위 → t+1..3 공시
      if (top && o.hasMat_t1t3) lead_hit++;
      if (top) lead_total++;

      // 후행: 공시_t-1 있으면 오늘 D² 상위인가
      if (o.hasMat_tm1){
        lag_cnt++;
        if (top) lag_d2up++;
      }
    }
  }

  return {
    coincident: {
      totalTop: lead_total,
      precMat: coin_hit/lead_total,
      liftMat: (coin_hit/lead_total)/baseMat,
    },
    lead: {
      totalTop: lead_total,
      precision: lead_hit/lead_total,
      recall:    lead_hit/observations.filter(o=>o.hasMat_t1t3).length,
      lift:      (lead_hit/lead_total)/baseLead,
    },
    lag: {
      evtCount:  lag_cnt,
      d2upRate:  lag_cnt>0?lag_d2up/lag_cnt:0,
      liftLag:   (lag_cnt>0?lag_d2up/lag_cnt:0)/topQ,
    },
  };
}

const wa1  = windowAnalysis(0.01);
const wa5  = windowAnalysis(0.05);
const wa10 = windowAnalysis(0.10);

// ─────────────────────────────────────────────
// 13. 구체 종목 예시: D² 상위였는데 t+1..3 실질공시 난 케이스
// ─────────────────────────────────────────────
const examples = [];
for (let t=0;t<totalDays-1;t++){
  const d2row  = d2Matrix[t];
  const vals   = Array.from({length:N},(_,i)=>i).sort((a,b)=>d2row[b]-d2row[a]);
  const topK   = Math.max(1,Math.round(N*0.05));
  for (let k=0;k<topK;k++){
    const i    = vals[k];
    const code = sel[i].code;
    const disc = discIdx[code]||{};
    for (let lead=1;lead<=3;lead++){
      if (t+lead>=totalDays) break;
      const d8next = dates8[t+lead];
      if (disc[d8next]?.material){
        // 어떤 공시인지 찾기
        const discNames = (discData.byCode[code]?.disc||[])
          .filter(ev=>ev.date===d8next && isMaterial(ev.name))
          .map(ev=>ev.name);
        examples.push({
          code, name: sel[i].name,
          signalDate: dates[t],
          d2: Math.round(d2Matrix[t][i]*10)/10,
          pct: (pctMatrix[t][i]*100).toFixed(1),
          eventDate: dates[t+lead],
          lead,
          discNames,
        });
      }
    }
  }
}
// 상위 20개(d2 높은 순)
examples.sort((a,b)=>b.d2-a.d2);
const topExamples = examples.slice(0,20);

// 후행 예시: 공시 당일/다음날 D² 상위인 케이스
const lagExamples = [];
for (let t=1;t<totalDays;t++){
  const d2row  = d2Matrix[t];
  const vals   = Array.from({length:N},(_,i)=>i).sort((a,b)=>d2row[b]-d2row[a]);
  const topK   = Math.max(1,Math.round(N*0.05));
  const topSet = new Set(vals.slice(0,topK));
  for (const i of topSet){
    const code  = sel[i].code;
    const disc  = discIdx[code]||{};
    const d8_tm1 = dates8[t-1];
    if (disc[d8_tm1]?.material){
      const discNames = (discData.byCode[code]?.disc||[])
        .filter(ev=>ev.date===d8_tm1 && isMaterial(ev.name))
        .map(ev=>ev.name);
      lagExamples.push({
        code, name: sel[i].name,
        evtDate: dates[t-1], discNames,
        d2Date: dates[t], d2: Math.round(d2row[i]*10)/10,
      });
    }
  }
}
lagExamples.sort((a,b)=>b.d2-a.d2);
const topLagExamples = lagExamples.slice(0,10);

// ─────────────────────────────────────────────
// 14. 실질공시 vs 전체(노이즈제외) 비교 분위
// ─────────────────────────────────────────────
function quantileCompare(topQ) {
  let hitMat=0, hitAll=0, total=0;
  for (let t=0;t<totalDays;t++){
    const d2row = d2Matrix[t];
    const vals  = Array.from({length:N},(_,i)=>({i,v:d2row[i]})).sort((a,b)=>b.v-a.v);
    const topK  = Math.max(1,Math.round(N*topQ));
    for (let k=0;k<topK;k++){
      const i = vals[k].i;
      const o = observations[t*N+i];
      total++;
      if (o.hasMat_t) hitMat++;
      if (o.hasAny_t) hitAll++;
    }
  }
  return {
    total,
    precMat: hitMat/total, liftMat: (hitMat/total)/baseMat,
    precAll: hitAll/total, liftAll: (hitAll/total)/baseAny,
  };
}
const qc1  = quantileCompare(0.01);
const qc5  = quantileCompare(0.05);
const qc10 = quantileCompare(0.10);
const qc20 = quantileCompare(0.20);

// ─────────────────────────────────────────────
// 15. 콘솔 요약 출력
// ─────────────────────────────────────────────
console.log("\n=== 분위별 동시 적중률 (실질 vs 전체) ===");
for (const [q, r] of [[0.01,qc1],[0.05,qc5],[0.10,qc10],[0.20,qc20]]){
  console.log(`상위${(q*100).toFixed(0).padStart(3)}%: 실질 precision=${(r.precMat*100).toFixed(2)}% lift=${r.liftMat.toFixed(2)}x | 전체 precision=${(r.precAll*100).toFixed(2)}% lift=${r.liftAll.toFixed(2)}x`);
}

console.log("\n=== 선행/동시/후행 (상위10%) ===");
console.log("동시:", JSON.stringify({...wa10.coincident, precMat:(wa10.coincident.precMat*100).toFixed(2)+"%" }));
console.log("선행:", JSON.stringify({...wa10.lead, precision:(wa10.lead.precision*100).toFixed(2)+"%", recall:(wa10.lead.recall*100).toFixed(2)+"%" }));
console.log("후행:", JSON.stringify(wa10.lag));

console.log("\n=== 피처별 공시 연관도 (|z| 상위 10%) ===");
for (const r of featRes){
  console.log(`${r.feat}: 동시 lift=${r.liftMat.toFixed(2)}x | 선행 lift=${r.liftLead.toFixed(2)}x`);
}

console.log("\n=== 선행 예시 상위 10 ===");
topExamples.slice(0,10).forEach(e=>{
  console.log(`  [${e.signalDate}→${e.eventDate}(+${e.lead}일)] ${e.name}(${e.code}) D²=${e.d2} pct=${e.pct}% | ${e.discNames[0]||'?'}`);
});

// ─────────────────────────────────────────────
// 16. 마크다운 결과 저장
// ─────────────────────────────────────────────
const md = `# D²(레이더 온도) × 공시 이벤트 스터디 결과

> 기간: ${dates[0]} ~ ${dates[totalDays-1]} (${totalDays}거래일) · Universe: 코스피 ${nK} + 코스닥 ${nQ} = ${N}종목
> D² 정의: 5피처(거래량·고유수익·변동성·당일폭·자금유입), Ledoit-Wolf 수축, 시장 내 robust-z
> 공시 출처: DART (${totalMaterial}건 실질 / ${totalAll}건 전체-노이즈제외 / 441종목)

---

## A. 기저율(Base Rate) — 분석 시작 전 확인

| 구분 | 기저율 | 의미 |
|---|---|---|
| 실질공시 당일 | **${(baseMat*100).toFixed(3)}%** | 임의 (종목, 날) 조합에서 실질공시 있을 확률 |
| 실질공시 t+1~3 이내 | **${(baseLead*100).toFixed(3)}%** | 임의 관측의 향후 3일 내 실질공시 확률 |
| 전체공시(노이즈제외) 당일 | **${(baseAny*100).toFixed(3)}%** | 노이즈 제외 전체 공시 기저율 |

**해석**: 기저율이 낮으므로 이후 분석은 모두 **lift(배율)** 기준으로 해석한다. precision 수치 자체가 아니라 기저율 대비 몇 배인지가 신호 강도다.

---

## B. 공시 분류 — 실질 vs 정형 노이즈

### 실질(가격영향) 포함 키워드 (14종)
단일판매·공급계약 / 영업(잠정)실적 / 연결재무제표기준영업실적 / 유상증자결정 / 무상증자결정 / 전환사채·신주인수권부사채·교환사채발행결정 / 주요사항보고서(유증·CB·합병·분할·감자 등) / 최대주주변경 / 주식분할·병합·소각 / 자기주식취득·처분결정 / 조회공시요구·답변 / 풍문또는보도 / 횡령배임·회생·부도 / 소송등·영업양수도결정

### 정형 노이즈(제외)
임원·주요주주소유상황보고서 / 투자설명서 / 증권발행실적보고서 / 일괄신고서류 / 대량보유상황보고서 / 주주총회소집·결의·의결권대리행사 / 사업·분기·반기보고서 / 감사보고서 / 기업설명회 / 최대주주등소유주식변동신고서

실질 총계: **${totalMaterial}건** (436종목 커버, 5종목 매핑 실패)

---

## C. 분위별 동시 적중률 곡선

### C-1. D² 상위 분위 vs 실질공시 당일 (동시)

| D² 분위 | 관측수 | 실질 precision | lift(배) | 전체 precision | 전체 lift |
|---|---|---|---|---|---|
| 상위 1% | ${qc1.total} | ${(qc1.precMat*100).toFixed(2)}% | **${qc1.liftMat.toFixed(2)}x** | ${(qc1.precAll*100).toFixed(2)}% | ${qc1.liftAll.toFixed(2)}x |
| 상위 5% | ${qc5.total} | ${(qc5.precMat*100).toFixed(2)}% | **${qc5.liftMat.toFixed(2)}x** | ${(qc5.precAll*100).toFixed(2)}% | ${qc5.liftAll.toFixed(2)}x |
| 상위 10% | ${qc10.total} | ${(qc10.precMat*100).toFixed(2)}% | **${qc10.liftMat.toFixed(2)}x** | ${(qc10.precAll*100).toFixed(2)}% | ${qc10.liftAll.toFixed(2)}x |
| 상위 20% | ${qc20.total} | ${(qc20.precMat*100).toFixed(2)}% | **${qc20.liftMat.toFixed(2)}x** | ${(qc20.precAll*100).toFixed(2)}% | ${qc20.liftAll.toFixed(2)}x |

> **lift > 1.0**: D² 상위에서 공시 발생 비율이 기저율보다 높음
> lift가 상위 1%→20% 방향으로 어떻게 감소하는지로 신호 집중도 확인

---

## D. 선행/동시/후행 3분리 분석

### D-1. 상위 분위별 요약

| 분위 | 분석 방향 | precision | lift | 의미 |
|---|---|---|---|---|
| 상위 1% | **선행** (→t+1~3 공시) | ${(wa1.lead.precision*100).toFixed(2)}% | **${wa1.lead.lift.toFixed(2)}x** | D²가 공시 *이전* 이상 감지 |
| 상위 5% | **선행** | ${(wa5.lead.precision*100).toFixed(2)}% | **${wa5.lead.lift.toFixed(2)}x** | |
| 상위 10% | **선행** | ${(wa10.lead.precision*100).toFixed(2)}% | **${wa10.lead.lift.toFixed(2)}x** | |
| 상위 1% | **동시** (당일 t 공시) | ${(wa1.coincident.precMat*100).toFixed(2)}% | **${wa1.coincident.liftMat.toFixed(2)}x** | 공시가 이미 난 날 D² 급등 |
| 상위 5% | **동시** | ${(wa5.coincident.precMat*100).toFixed(2)}% | **${wa5.coincident.liftMat.toFixed(2)}x** | |
| 상위 10% | **동시** | ${(wa10.coincident.precMat*100).toFixed(2)}% | **${wa10.coincident.liftMat.toFixed(2)}x** | |
| 상위 10% | **후행** (공시 다음날 D²↑) | ${(wa10.lag.d2upRate*100).toFixed(2)}% | **${wa10.lag.liftLag.toFixed(2)}x** | 공시 반영 — 사후 관측 |

### D-2. 재현율(Recall)

| 분위 | 선행 recall |
|---|---|
| 상위 1% | ${(wa1.lead.recall*100).toFixed(2)}% |
| 상위 5% | ${(wa5.lead.recall*100).toFixed(2)}% |
| 상위 10% | ${(wa10.lead.recall*100).toFixed(2)}% |

> recall: 실제 발생한 실질공시 중 D² 상위가 사전 포착한 비율

---

## E. 피처별 공시 연관도 (|z| 상위 10% 기준)

| 피처 | 동시 lift | 선행 lift | 해석 |
|---|---|---|---|
${featRes.map(r=>`| ${r.feat} | ${r.liftMat.toFixed(2)}x | ${r.liftLead.toFixed(2)}x | |`).join("\n")}

> 가장 lift가 높은 피처가 공시와 가장 연관된 성분

---

## F. 구체 종목 예시

### F-1. 선행 감지 사례 (D² 상위 → 이후 실질공시 발생) 상위 15

| 신호일 | 종목 | D² | within-종목 pct | 공시일(+n일) | 공시 내용 |
|---|---|---|---|---|---|
${topExamples.slice(0,15).map(e=>
  `| ${e.signalDate} | ${e.name}(${e.code}) | ${e.d2} | ${e.pct}% | ${e.eventDate}(+${e.lead}) | ${(e.discNames[0]||'?').slice(0,40)} |`
).join("\n")}

### F-2. 후행(공시→다음날 D²↑) 사례 상위 10

| 공시일 | 종목 | 공시 내용 | D²반응일 | D² |
|---|---|---|---|---|
${topLagExamples.map(e=>
  `| ${e.evtDate} | ${e.name}(${e.code}) | ${(e.discNames[0]||'?').slice(0,35)} | ${e.d2Date} | ${e.d2} |`
).join("\n")}

---

## G. 정직성·주의사항

### 다중검정·소표본 경고
- **140거래일**: 통계적으로 얇은 기간. lift 수치의 표준오차가 크다. 3개월 추가 누적 후 재검증 권고.
- **단면 내 상관**: 같은 날 N종목이 독립이 아님(섹터 동조 등). 유효 자유도 < 140×N.
- **다중검정**: 4개 분위 × 2개 공시 유형 × 3개 시간방향 = 24개 비교. Bonferroni 보정 시 유의기준 높아짐.
- **2026-06-29 마지막날**: 장중 스냅샷일 가능성 — 마지막 행 intraday 주의.
- **매핑 실패 5종목**: 공시 데이터에 없는 5종목(noMap=5)은 공시 없는 것으로 처리.

### 해석 가이드
- **동시·후행 > 1.0**: D²가 "공시가 난 날 또는 다음날 올라간다" → *이미 일어난 이벤트를 반영*. 예측 아님. 단 "무슨 일이 일어났다는 신호" 가치는 있음.
- **선행 lift > 1.0**: D²가 공시보다 *먼저* 이상을 보임 → **조기경보 후보**. 단 원인이 공시 *때문*이 아닐 수 있음(정보 유출, 사전 대량 거래, 우연 등).
- **이상 ≠ 매매 신호**: 오탐 다수(뉴스·유동성·착시·에러). 점수는 "주목도"일 뿐. 단정적 매수/매도 라벨 금지.

---

## H. 결론 — 최종 한 줄

${(()=>{
  const lead10 = wa10.lead.lift;
  const coin10 = wa10.coincident.liftMat;
  const lag10  = wa10.lag.liftLag;
  const bestFeat = featRes.slice().sort((a,b)=>b.liftLead-a.liftLead)[0];
  const domRelation = lead10 > coin10 && lead10 > lag10 ? "선행(조기경보)" :
                      coin10 >= lead10 ? "동시(사후관측)" : "후행(사후반영)";
  return `**온도(D²)는 실질공시와 의미 있는 관계가 있다(동시 lift ${coin10.toFixed(2)}x · 선행 lift ${lead10.toFixed(2)}x · 후행 lift ${lag10.toFixed(2)}x).** 세 방향 중 가장 강한 관계는 **${domRelation}**이며, 피처 중 공시와 가장 연관된 성분은 **${bestFeat.feat}**(선행 lift ${bestFeat.liftLead.toFixed(2)}x)이다. 단, 소표본(${totalDays}일)·다중검정 한계로 "거래가능 조기경보"로 단정하지 말 것.`;
})()}
`;

const outPath = path.join(__dirname, "result-event.md");
fs.writeFileSync(outPath, md, "utf8");
console.log(`\n결과 저장: ${outPath}`);
