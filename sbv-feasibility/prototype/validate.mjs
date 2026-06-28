// [SBV 피저빌리티 — 검증] 우리 모델(분해·이상탐지)을 정직하게 검증.
//  V1 서술 검증: 시장·섹터가 종목 변동의 몇 %를 설명하나 (분해의 전제 확인)
//  V2 반증 검증: 고유 이상(ε_t)이 다음날 고유수익(ε_{t+1})과 관계있나 (룩어헤드 차단)
//  ※ 데이터: src/data/radar-frames.json (30거래일×50종목, 일봉). 소표본·예측 아님 — 한계 명시.
import fs from "node:fs";
import path from "node:path";
const ROOT = process.cwd();
const radar = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/radar-frames.json"), "utf8"));
const stocks = radar.stocks, themeOf = stocks.map((s) => s.theme ?? "기타");
const F = radar.frameCount, N = stocks.length;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / (Math.sqrt(da * db) || 1e-9); };
const r2 = (v) => Math.round(v * 1000) / 1000;

// 일별 시장·섹터 평균 + 종목별 시계열(ret, market, sector, ε)
const market = [], sectorMean = []; // per day
const ret = stocks.map(() => []); // ret[i][d]
for (let d = 0; d < F; d++) {
  const r = radar.frames[d].b.map((b) => b[5]);
  market[d] = mean(r);
  const ss = {}, sn = {}; r.forEach((v, i) => { const t = themeOf[i]; ss[t] = (ss[t] || 0) + v; sn[t] = (sn[t] || 0) + 1; });
  const sm = {}; for (const t in ss) sm[t] = ss[t] / sn[t]; sectorMean[d] = sm;
  for (let i = 0; i < N; i++) ret[i][d] = r[i];
}
// 고유 잔차 ε_{i,d} = ret − 섹터평균
const eps = stocks.map((_, i) => ret[i].map((v, d) => v - sectorMean[d][themeOf[i]]));

// ── V1: 시장·섹터 설명력 (종목별 시계열 R²) ──
const r2Mkt = [], r2Sys = [], idioShare = [];
for (let i = 0; i < N; i++) {
  const rm = corr(ret[i], market) ** 2;          // 시장만
  const ve = std(eps[i]) ** 2, vr = std(ret[i]) ** 2;
  const rsys = 1 - ve / (vr || 1e-9);              // 시장+섹터(잔차 제거) 설명비
  r2Mkt.push(rm); r2Sys.push(rsys); idioShare.push(ve / (vr || 1e-9));
}

// ── V2: 반증 — 고유 이상 → 다음날 고유수익 (룩어헤드 차단: ε_t로 ε_{t+1} 설명) ──
const xt = [], yt = []; // ε_t, ε_{t+1}
for (let i = 0; i < N; i++) for (let d = 0; d < F - 1; d++) { xt.push(eps[i][d]); yt.push(eps[i][d + 1]); }
const ac1 = corr(xt, yt);                          // 고유 1차 자기상관(<0 평균회귀, >0 모멘텀)
const nPair = xt.length, seRho = 1 / Math.sqrt(nPair);
// 큰 고유 이탈(상위 10%) 다음날 되돌림 여부
const absSorted = [...xt].map(Math.abs).sort((a, b) => a - b);
const thr = absSorted[Math.floor(absSorted.length * 0.9)];
let big = 0, revert = 0;
for (let k = 0; k < xt.length; k++) if (Math.abs(xt[k]) >= thr) { big++; if (Math.sign(yt[k]) === -Math.sign(xt[k])) revert++; }
const revRate = revert / (big || 1);

const md = [];
md.push(`# 모델 검증 결과 (정직한 검증)\n`);
md.push(`> 데이터: ${radar.window}, ${N}종목 일봉. **소표본 — 예측력 결론용 아님, 방법 타당성 검증.**\n`);
md.push(`## V1. 분해 검증 — 시장·섹터가 종목 변동을 얼마나 설명하나 (서술적, 유의미)`);
md.push(`- 시장만 평균 R²: **${r2(mean(r2Mkt) * 100)}%**`);
md.push(`- 시장+섹터 평균 설명비: **${r2(mean(r2Sys) * 100)}%**`);
md.push(`- 평균 **고유(종목 특이) 비중: ${r2(mean(idioShare) * 100)}%**`);
md.push(`\n→ 종목 변동의 약 ${r2(mean(r2Sys) * 100)}%가 시장·섹터로 설명됨. **분해 전제(시장·섹터를 빼야 고유가 보인다) 확인.** SBV의 'Program+Context 지배'와 같은 구조.\n`);
md.push(`## V2. 반증 검증 — 고유 이상이 미래와 관계있나 (룩어헤드 차단)`);
md.push(`- 고유수익 1차 자기상관 ρ(ε_t, ε_{t+1}) = **${r2(ac1)}**  (표본쌍 ${nPair}, SE≈${r2(seRho)})`);
md.push(`- 해석: ρ<0=평균회귀 / ρ>0=모멘텀 / |ρ|≲2·SE(${r2(2 * seRho)})=무의미(효율시장)`);
md.push(`- 큰 고유 이탈(상위10%) 다음날 되돌림 비율: **${r2(revRate * 100)}%** (50%=무작위)`);
const verdict = Math.abs(ac1) < 2 * seRho ? "효율적(예측 신호 없음) — 효율시장과 정합" : ac1 < 0 ? "약한 평균회귀 경향" : "약한 모멘텀 경향";
md.push(`\n→ 판정: **${verdict}.** ${Math.abs(ac1) < 2 * seRho ? "고유 이상은 *탐지*엔 유효하나 *예측*엔 신호 없음 — 라운드테이블 결론(예측 불가) 재확인." : "단, 거래비용 40bp·소표본 고려 시 실거래 edge로 단정 금지."}\n`);
md.push(`## 결론`);
md.push(`- **서술(분해)은 검증됨**: 시장·섹터가 변동의 ${r2(mean(r2Sys) * 100)}%를 설명 → "왜 떴나" 분해가 실제로 의미.`);
md.push(`- **예측은 ${Math.abs(ac1) < 2 * seRho ? "신호 없음(정직)" : "미약, 단정 불가"}**: 우리 모델은 *예측기가 아니라 관측·분해 렌즈*임이 데이터로 재확인.`);
md.push(`- **한계**: 30거래일×50종목 소표본, 일봉, 거래비용 미차감. 본 검증은 *방법 타당성*이지 *시장 알파 주장*이 아님.`);
fs.writeFileSync(path.join(ROOT, "sbv-feasibility/prototype/result-validation.md"), md.join("\n"));

console.log(`V1 시장+섹터 설명비 평균 ${r2(mean(r2Sys) * 100)}% / 고유비중 ${r2(mean(idioShare) * 100)}%`);
console.log(`V2 고유 자기상관 ρ=${r2(ac1)} (SE≈${r2(seRho)}, |2SE|=${r2(2 * seRho)}) → ${verdict}`);
console.log(`   큰 이탈 다음날 되돌림 ${r2(revRate * 100)}% (50%=무작위)`);
console.log("→ sbv-feasibility/prototype/result-validation.md");
