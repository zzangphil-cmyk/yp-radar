// 국민연금 레이더 — 사이트 데이터 빌드
// 입력: data/nps-panel.json (2020~2024, build-nps-panel.mjs 산출)
// 출력: src/data/nps-panel.json, nps-changes.json, nps-insights.json
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "data/nps-panel.json"), "utf8"));
const years = raw.years; // [2020..2024]
const cur = years[years.length - 1];
const prev = years[years.length - 2];
const fin = Number.isFinite;
const r2 = (n) => Math.round(n * 100) / 100;
const slugify = (name) =>
  name.replace(/\(주\)|주식회사|㈜/g, "").replace(/[\s/\\?#%&]/g, "").trim();

// --- 1) 정제 패널 ---
const seen = new Set();
const stocks = [];
for (const p of raw.stocks) {
  const slug = slugify(p.name);
  if (!slug || seen.has(slug)) continue;
  seen.add(slug);
  const byYear = {};
  for (const y of years) {
    const v = p.byYear[y];
    if (!v) continue;
    byYear[y] = {
      value: fin(v.value) ? Math.round(v.value) : null,
      weight: fin(v.weight) ? r2(v.weight) : null,
      ownership: fin(v.ownership) ? r2(v.ownership) : null,
    };
  }
  const oc = byYear[cur]?.ownership;
  const op = byYear[prev]?.ownership;
  const vc = byYear[cur]?.value;
  const vp = byYear[prev]?.value;
  stocks.push({
    name: p.name,
    slug,
    byYear,
    inCur: byYear[cur] != null,
    ownDelta: fin(oc) && fin(op) ? r2(oc - op) : null,
    valDelta: fin(vc) && fin(vp) ? vc - vp : null,
  });
}
const inCurStocks = stocks.filter((s) => s.inCur);

fs.writeFileSync(
  path.join(ROOT, "src/data/nps-panel.json"),
  JSON.stringify({ years, curYear: cur, prevYear: prev, count: stocks.length, stocks }, null, 0),
);

// --- 2) 변화(changes) TOP-N ---
const TOP = 25;
const changed = stocks.filter((s) => fin(s.ownDelta));
const accumulated = [...changed].sort((a, b) => b.ownDelta - a.ownDelta).slice(0, TOP).map(slim);
const reduced = [...changed].sort((a, b) => a.ownDelta - b.ownDelta).slice(0, TOP).map(slim);

const inCurSet = new Set(inCurStocks.map((s) => s.slug));
const inPrevSet = new Set(stocks.filter((s) => s.byYear[prev]).map((s) => s.slug));
const newEntries = inCurStocks
  .filter((s) => !inPrevSet.has(s.slug))
  .map((s) => ({ name: s.name, slug: s.slug, value: s.byYear[cur].value, ownership: s.byYear[cur].ownership }))
  .sort((a, b) => b.value - a.value)
  .slice(0, TOP);
const exits = stocks
  .filter((s) => s.byYear[prev] && !inCurSet.has(s.slug))
  .map((s) => ({ name: s.name, slug: s.slug, prevValue: s.byYear[prev].value, prevOwnership: s.byYear[prev].ownership }))
  .sort((a, b) => b.prevValue - a.prevValue)
  .slice(0, TOP);

const totals = years.map((y) => ({
  year: y,
  jo: r2(stocks.reduce((s, p) => s + (p.byYear[y]?.value || 0), 0) / 10000),
}));

const topHoldings = [...inCurStocks]
  .sort((a, b) => b.byYear[cur].value - a.byYear[cur].value)
  .slice(0, 15)
  .map((s) => ({
    name: s.name,
    slug: s.slug,
    value: s.byYear[cur].value,
    ownership: s.byYear[cur].ownership,
    trend: years.map((y) => s.byYear[y]?.ownership ?? null),
  }));

fs.writeFileSync(
  path.join(ROOT, "src/data/nps-changes.json"),
  JSON.stringify(
    {
      years, curYear: cur, prevYear: prev, totals,
      counts: {
        accumulated: changed.filter((c) => c.ownDelta > 0.01).length,
        reduced: changed.filter((c) => c.ownDelta < -0.01).length,
        newEntries: inCurStocks.filter((s) => !inPrevSet.has(s.slug)).length,
        exits: stocks.filter((s) => s.byYear[prev] && !inCurSet.has(s.slug)).length,
      },
      accumulated, reduced, newEntries, exits, topHoldings,
    },
    null, 1,
  ),
);

// --- 3) 인사이트 ---
// 테마 거품: 평가액↑ & 지분율↓ (주가만 오르고 국민연금은 매도)
const themeBubble = stocks
  .filter((s) => fin(s.valDelta) && s.valDelta > 0 && fin(s.ownDelta) && s.ownDelta < -0.1)
  .sort((a, b) => a.ownDelta - b.ownDelta)
  .slice(0, 15)
  .map(slim);
// 역발상 매집: 평가액↓ & 지분율↑
const contrarian = stocks
  .filter((s) => fin(s.valDelta) && s.valDelta < 0 && fin(s.ownDelta) && s.ownDelta > 0.1)
  .sort((a, b) => b.ownDelta - a.ownDelta)
  .slice(0, 15)
  .map(slim);

// 5년 연속 매집/축소
function steps(s) {
  const seq = years.map((y) => s.byYear[y]?.ownership);
  if (seq.some((x) => !fin(x))) return null;
  const d = [];
  for (let i = 1; i < seq.length; i++) d.push(seq[i] - seq[i - 1]);
  return { seq, d, net: r2(seq[seq.length - 1] - seq[0]) };
}
const consecAccum = [];
const consecReduce = [];
for (const s of stocks) {
  const st = steps(s);
  if (!st) continue;
  if (st.d.every((x) => x >= -0.001) && st.net > 0.3)
    consecAccum.push({ name: s.name, slug: s.slug, net: st.net, trend: st.seq.map(r2) });
  if (st.d.every((x) => x <= 0.001) && st.net < -0.3)
    consecReduce.push({ name: s.name, slug: s.slug, net: st.net, trend: st.seq.map(r2) });
}
consecAccum.sort((a, b) => b.net - a.net);
consecReduce.sort((a, b) => a.net - b.net);

// 집중도 (cur year, 평가액 기준)
const curVals = inCurStocks.map((s) => s.byYear[cur].value).sort((a, b) => b - a);
const totalVal = curVals.reduce((a, b) => a + b, 0);
const sumN = (n) => curVals.slice(0, n).reduce((a, b) => a + b, 0);
const concentration = {
  totalJo: r2(totalVal / 10000),
  top10: r2((sumN(10) / totalVal) * 100),
  top50: r2((sumN(50) / totalVal) * 100),
  top100: r2((sumN(100) / totalVal) * 100),
};

fs.writeFileSync(
  path.join(ROOT, "src/data/nps-insights.json"),
  JSON.stringify(
    { curYear: cur, prevYear: prev, years, themeBubble, contrarian,
      consecAccum: consecAccum.slice(0, 20), consecReduce: consecReduce.slice(0, 20), concentration },
    null, 1,
  ),
);

// --- 4) 9분면 점도표 (지분율 변화 × 추정 수익률) ---
// 추정 가격수익률 ≈ (평가액_t/평가액_s) / (지분율_t/지분율_s) - 1
function estReturn(s, a, b) {
  const va = s.byYear[a]?.value, vb = s.byYear[b]?.value;
  const oa = s.byYear[a]?.ownership, ob = s.byYear[b]?.ownership;
  if (![va, vb, oa, ob].every(fin) || oa <= 0 || va <= 0) return null;
  const r = (vb / va) / (ob / oa) - 1;
  if (!fin(r)) return null;
  return Math.max(-0.95, Math.min(3, r)); // 극단치 클램프
}
const intervals = [];
for (let i = 1; i < years.length; i++)
  intervals.push({ key: String(years[i]), label: `${years[i - 1]}→${years[i]}`, from: years[i - 1], to: years[i] });
intervals.push({ key: "all", label: `${years[0]}→${cur}`, from: years[0], to: cur });

const quadrant = {};
for (const iv of intervals) {
  const arr = [];
  for (const s of stocks) {
    const oa = s.byYear[iv.from]?.ownership, ob = s.byYear[iv.to]?.ownership;
    if (!fin(oa) || !fin(ob)) continue; // 양 시점 모두 보유한 종목만
    const r = estReturn(s, iv.from, iv.to);
    if (r == null) continue;
    arr.push({ name: s.name, slug: s.slug, od: r2(ob - oa), r: Math.round(r * 1000) / 10 });
  }
  quadrant[iv.key] = arr;
}
fs.writeFileSync(
  path.join(ROOT, "src/data/nps-quadrant.json"),
  JSON.stringify({ intervals, data: quadrant }, null, 0),
);

console.log("패널 종목:", stocks.length, "| 2024 보유:", inCurStocks.length);
console.log("quadrant 구간:", intervals.map((i) => `${i.label}(${quadrant[i.key].length})`).join(", "));
console.log("changes — 매집:", accumulated.length, "축소:", reduced.length, "신규:", newEntries.length, "매도:", exits.length);
console.log("insights — 테마거품:", themeBubble.length, "역발상:", contrarian.length, "연속매집:", consecAccum.length, "연속축소:", consecReduce.length);
console.log("집중도 top10:", concentration.top10 + "%", "top50:", concentration.top50 + "%");
console.log("저장 완료: src/data/nps-panel.json, nps-changes.json, nps-insights.json");

function slim(s) {
  return {
    name: s.name, slug: s.slug,
    ownCur: s.byYear[cur]?.ownership ?? null,
    ownPrev: s.byYear[prev]?.ownership ?? null,
    ownDelta: s.ownDelta,
    valCur: s.byYear[cur]?.value ?? null,
    valDelta: s.valDelta,
  };
}
