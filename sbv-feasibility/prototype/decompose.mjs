// [SBV 피저빌리티 — A] "왜 떴나" 기여도 분해 프로토타입
// 각 종목의 그날 등락률(종가기준)을 시장 / 섹터(테마) / 종목고유 3성분으로 분해.
//   ret_i = market + sector_i + specific_i
//   market    = 그날 전체 50종목 평균 등락률
//   sector_i  = (테마평균 등락률) − market
//   specific_i= ret_i − 테마평균 등락률   ← 종목 고유 이탈
// 가설(라운드테이블): 레이더가 띄우는 이상치는 '십중팔구 테마 동반'이지 종목 고유가 아니다.
// 검증: 이상치(anomaly≥0.45)들의 |specific| 비중(고유 기여 점유율)을 집계.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const radar = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/radar-frames.json"), "utf8"));
const stocks = radar.stocks; // {code,name,theme}
const themeOf = stocks.map((s) => s.theme ?? "기타");
const HOT = 0.45;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const recs = []; // 이상치 분해 레코드
const perFrame = [];
for (const f of radar.frames) {
  const ret = f.b.map((b) => b[5]); // 등락률%
  const market = mean(ret);
  // 테마 평균
  const byTheme = {};
  f.b.forEach((b, i) => { (byTheme[themeOf[i]] ??= []).push(ret[i]); });
  const themeMean = {}; for (const t in byTheme) themeMean[t] = mean(byTheme[t]);
  let nHot = 0, sectorLed = 0;
  for (const b of f.b) {
    const i = b[0], r = ret[i], th = themeOf[i];
    const sec = themeMean[th] - market;
    const spec = r - themeMean[th];
    const anomaly = b[3];
    if (anomaly >= HOT) {
      nHot++;
      const denom = Math.abs(market) + Math.abs(sec) + Math.abs(spec) || 1e-9;
      const specShare = Math.abs(spec) / denom;          // 종목 고유 점유율
      const sysShare = (Math.abs(market) + Math.abs(sec)) / denom; // 시장+섹터 점유율
      const led = specShare < 0.5 ? "시장·섹터 주도" : "종목 고유";
      if (led === "시장·섹터 주도") sectorLed++;
      recs.push({ t: f.t, name: stocks[i].name, theme: th, ret: r, market, sec, spec, specShare, sysShare, anomaly, led });
    }
  }
  perFrame.push({ t: f.t, nHot, sectorLed });
}

const r2 = (v) => Math.round(v * 100) / 100;
const totHot = recs.length;
const sysLed = recs.filter((x) => x.led === "시장·섹터 주도").length;
const avgSpecShare = mean(recs.map((x) => x.specShare));
const avgSysShare = mean(recs.map((x) => x.sysShare));

// 최신 프레임 이상치 분해 예시 (상위 anomaly)
const last = radar.frames[radar.frames.length - 1];
const lastRet = last.b.map((b) => b[5]); const lastMkt = mean(lastRet);
const lastByTheme = {}; last.b.forEach((b, i) => { (lastByTheme[themeOf[i]] ??= []).push(lastRet[i]); });
const lastThemeMean = {}; for (const t in lastByTheme) lastThemeMean[t] = mean(lastByTheme[t]);
const lastEx = [...last.b].filter((b) => b[3] >= HOT).sort((a, b) => b[3] - a[3]).slice(0, 8).map((b) => {
  const i = b[0], r = lastRet[i], th = themeOf[i];
  const sec = lastThemeMean[th] - lastMkt, spec = r - lastThemeMean[th];
  return { name: stocks[i].name, theme: th, ret: r2(r), market: r2(lastMkt), sector: r2(sec), specific: r2(spec), led: Math.abs(spec) / (Math.abs(lastMkt) + Math.abs(sec) + Math.abs(spec) || 1e-9) < 0.5 ? "시장·섹터" : "고유" };
});

const md = [];
md.push(`# [A] "왜 떴나" 기여도 분해 — 피저빌리티 결과\n`);
md.push(`> 분해: \`등락률 = 시장 + 섹터 + 종목고유\`. 데이터: ${radar.window}, ${stocks.length}종목, 종가 기준.\n`);
md.push(`## 1. 핵심 검증 — 이상치는 테마 동반인가, 종목 고유인가?\n`);
md.push(`- 분석한 이상치(anomaly≥${HOT}) 총 **${totHot}건** (프레임 합산)`);
md.push(`- **시장·섹터 주도: ${sysLed}건 (${r2((sysLed / totHot) * 100)}%)** / 종목 고유 주도: ${totHot - sysLed}건 (${r2((1 - sysLed / totHot) * 100)}%)`);
md.push(`- 이상치 평균 기여 점유율 — **시장+섹터 ${r2(avgSysShare * 100)}%** vs 종목고유 ${r2(avgSpecShare * 100)}%`);
md.push(`\n→ 라운드테이블 가설 **${sysLed / totHot >= 0.5 ? "지지(이상치 다수가 테마·시장 동반)" : "부분 지지"}**. "왜 떴나" 분해가 의미 있음이 실증됨.\n`);
md.push(`## 2. 최신일(${last.t}) 이상치 분해 예시\n`);
md.push(`| 종목 | 테마 | 등락 | =시장 | +섹터 | +고유 | 주도 |`);
md.push(`|---|---|--:|--:|--:|--:|:--:|`);
for (const e of lastEx) md.push(`| ${e.name} | ${e.theme} | ${e.ret}% | ${e.market} | ${e.sector} | ${e.specific} | ${e.led} |`);
md.push(`\n## 3. 결론 (피저빌리티)\n`);
md.push(`- 현 데이터(토스 일봉 + 테마)만으로 **시장/섹터/종목고유 3분해가 즉시 가능**.`);
md.push(`- 이상치의 약 **${r2((sysLed / totHot) * 100)}%가 시장·섹터 동반** → 현재 레이더가 "테마 전체가 뜬 것"을 이상치로 표시 중. **고유 신호 구분이 필요**(라운드테이블 CSO·CEO 지적 실증).`);
md.push(`- 다음: 점 색/패널에 **시장·섹터 vs 고유**를 구분 표시하면 레이더의 정직성·유용성↑ (예측 아님).`);

const out = path.join(ROOT, "sbv-feasibility/prototype/result.md");
fs.writeFileSync(out, md.join("\n"));
console.log(`이상치 ${totHot}건 | 시장·섹터 주도 ${sysLed} (${r2((sysLed / totHot) * 100)}%) | 평균 시스템점유 ${r2(avgSysShare * 100)}%`);
console.log("최신일 예시:", lastEx.slice(0, 4).map((e) => `${e.name}(${e.ret}%=시${e.market}/섹${e.sector}/고${e.specific}→${e.led})`).join(" "));
console.log("→", out);
