// 부동산 분석기(81MB, base64 payload)에서 홈 시각화용 요약만 추출 → src/data/realestate-summary.json
// 원본 HTML은 그대로 두고 요약만 뽑으므로, 분석기 새 버전 교체 후 재실행하면 된다.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "realestate", "capital_area_market_analyzer_v3_0.html");
const OUT = path.join(ROOT, "src", "data", "realestate-summary.json");

const html = fs.readFileSync(SRC, "utf8");
const m = html.match(/_decodePayload\("([A-Za-z0-9+/=]+)"\)/);
if (!m) throw new Error("payload(base64)를 찾지 못함 — 분석기 구조가 바뀌었는지 확인");
const DATA = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));

// 원본과 동일: 일부 대형 테이블은 {columns, rows} 압축형 → 객체 배열로 펼침
const inflate = (t) => {
  if (Array.isArray(t)) return t;
  const cols = t?.columns ?? [];
  return (t?.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
};
for (const k of ["complex_market_monthly_area", "zone_market_monthly_area",
  "complex_market_window_area", "zone_market_window_area", "location", "official_land"]) {
  DATA[k] = inflate(DATA[k]);
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const median = (a) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// ── 1) 급지 분포 (전체 단지 기준) ─────────────────────────────────────────
const bandOrder = (b) => (b === "10급지" ? 10 : parseFloat(b));
const bandCount = {};
for (const c of DATA.complex_grade) {
  const b = c.grade_band;
  if (!b) continue;
  bandCount[b] = (bandCount[b] ?? 0) + 1;
}
const gradeBands = Object.entries(bandCount)
  .map(([band, count]) => ({ band, count }))
  .sort((a, b) => bandOrder(a.band) - bandOrder(b.band));

// ── 2) 권역별 요약 (7권역: 서울 5 + 경기 + 인천) ──────────────────────────
const regions = DATA.region_grade
  .map((r) => ({
    metro: r.metro_area,
    region: r.planning_region,
    grade: r1(r.median_provisional_grade),
    complexes: r.complex_count_400_plus,
    households: r.household_count,
    sigunguCount: r.sigungu_count,
  }))
  .sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99));

// ── 3) 거시 타이밍 시계열 (기준금리·국고3년, 최근 60개월) ─────────────────
const mt = DATA.macro_timing.filter((x) => x.reference_month);
const macroSeries = mt.slice(-60).map((x) => ({
  ym: x.reference_month,
  base: num(x.base_rate_pct),
  t3y: r1(num(x.treasury_3y_pct)),
  credit: num(x.household_credit_100m_krw),
}));
const macroLast = mt[mt.length - 1] ?? {};
const macro = {
  asOf: macroLast.reference_month ?? null,
  status: macroLast.macro_timing_status ?? null,
  baseRate: num(macroLast.base_rate_pct),
  baseRateChange6m: num(macroLast.base_rate_change_6m_pp),
  treasury3y: r1(num(macroLast.treasury_3y_pct)),
  treasury3yChange6m: r1(num(macroLast.treasury_3y_change_6m_pp)),
  cpiYoy: r1(num(macroLast.cpi_yoy_pct)),
  creditYoy: r1(num(macroLast.household_credit_yoy_pct)),
  series: macroSeries,
};

// ── 4) 생활권 시장 (1년 창, 전체 평형) — 평단가·변동률 랭킹 ────────────────
const zw = DATA.zone_market_window_area.filter(
  (z) => Number(z.window_years) === 1 && z.area_band === "전체"
);
const zones = zw
  .map((z) => ({
    region: z.planning_region,
    gu: z.sigungu,
    zone: z.official_living_zone,
    pyeong: num(z.sale_price_per_pyeong_median_10k_krw),
    changePct: r1(num(z.sale_price_per_pyeong_median_10k_krw_change_pct)),
    saleCount: num(z.sale_transaction_count),
    jeonseRatio: r1(num(z.jeonse_ratio_pct)),
  }))
  .filter((z) => z.pyeong != null);

const byPyeong = [...zones].sort((a, b) => b.pyeong - a.pyeong);
const byChange = [...zones].filter((z) => z.changePct != null && (z.saleCount ?? 0) >= 5);

const zoneStats = {
  count: zones.length,
  medianPyeong: Math.round(median(zones.map((z) => z.pyeong)) ?? 0),
  topPrice: byPyeong.slice(0, 8).map((z) => ({ ...z, pyeong: Math.round(z.pyeong) })),
  topRise: [...byChange].sort((a, b) => b.changePct - a.changePct).slice(0, 6)
    .map((z) => ({ ...z, pyeong: Math.round(z.pyeong) })),
  topFall: [...byChange].sort((a, b) => a.changePct - b.changePct).slice(0, 6)
    .map((z) => ({ ...z, pyeong: Math.round(z.pyeong) })),
};

// ── 5) 커버리지·기준일 ────────────────────────────────────────────────────
const coverage = DATA.coverage.map((c) => ({
  metro: c.metro_area,
  status: c.coverage_status,
  parsed: c.parsed_unit_count,
  official: c.official_unit_count,
  sigunguCount: c.sigungu_count,
  framework: c.official_framework,
}));

// ── 6) 정책 타임라인 (형제 페이지에서 파싱) ──────────────────────────────
function grabConstD(file) {
  const p = path.join(ROOT, "public", "realestate", file);
  if (!fs.existsSync(p)) return [];
  const s = fs.readFileSync(p, "utf8");
  const i = s.indexOf("const D=");
  if (i < 0) return [];
  const start = s.indexOf("[", i);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let q = start; q < s.length; q++) {
    const c = s[q];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) { end = q + 1; break; } }
  }
  return end > 0 ? JSON.parse(s.slice(start, end)) : [];
}

const POL = grabConstD("real_estate_policy_timeline_v1_0.html");
// 복합 분야("금융·세제")는 대표 버킷으로 묶어 가독성 확보
const BUCKET = [
  ["공급", /공급|정비/], ["금융", /금융/], ["세제", /세제|지방세/],
  ["청약·전매", /청약|전매/], ["임대차", /임대차/], ["규제지역", /규제지역|토지거래/],
];
const bucketOf = (cat) => BUCKET.find(([, re2]) => re2.test(cat ?? ""))?.[0] ?? "기타";
const polYears = {};
const polBuckets = {};
const polRegions = {};
for (const p of POL) {
  const y = (p.date ?? "").slice(0, 4);
  if (y) {
    polYears[y] = polYears[y] ?? { year: y, total: 0, major: 0 };
    polYears[y].total++;
    if (p.major) polYears[y].major++;
  }
  const b = bucketOf(p.category);
  polBuckets[b] = (polBuckets[b] ?? 0) + 1;
  polRegions[p.region ?? "기타"] = (polRegions[p.region ?? "기타"] ?? 0) + 1;
}
const polDates = POL.map((p) => p.date).filter(Boolean).sort();
const policy = {
  count: POL.length,
  range: polDates.length ? [polDates[0], polDates[polDates.length - 1]] : null,
  years: Object.values(polYears).sort((a, b) => a.year.localeCompare(b.year)),
  buckets: Object.entries(polBuckets).map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count),
  regions: Object.entries(polRegions).map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count),
  // 원본이 날짜순이 아니므로 명시적으로 최신순 정렬
  latest: [...POL]
    .filter((p) => p.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((p) => ({ date: p.date, title: p.title, region: p.region, category: p.category, major: !!p.major })),
};

// ── 7) 전문가 컨센서스 ────────────────────────────────────────────────────
const EXP = grabConstD("real_estate_expert_signals_v1_0.html");
const remarkYears = {};
for (const e of EXP) {
  for (const r of e.remarks ?? []) {
    const y = (r.ym ?? "").slice(0, 4);
    if (!y || r.direction == null) continue;
    remarkYears[y] = remarkYears[y] ?? { year: y, sum: 0, n: 0, up: 0, down: 0 };
    remarkYears[y].sum += r.direction;
    remarkYears[y].n++;
    if (r.direction > 0) remarkYears[y].up++;
    else if (r.direction < 0) remarkYears[y].down++;
  }
}
// 전문가별 최신 발언 방향
const latestByExpert = EXP.map((e) => {
  const rs = (e.remarks ?? []).filter((r) => r.ym).sort((a, b) => a.ym.localeCompare(b.ym));
  const last = rs[rs.length - 1];
  return last ? { name: e.name, ym: last.ym, direction: last.direction, theme: last.theme } : null;
}).filter(Boolean);
const dirNow = latestByExpert.length
  ? latestByExpert.reduce((a, x) => a + (x.direction ?? 0), 0) / latestByExpert.length
  : null;
const experts = {
  count: EXP.length,
  consensusNow: dirNow == null ? null : Math.round(dirNow * 100) / 100,
  bullish: latestByExpert.filter((x) => (x.direction ?? 0) > 0).length,
  bearish: latestByExpert.filter((x) => (x.direction ?? 0) < 0).length,
  neutral: latestByExpert.filter((x) => (x.direction ?? 0) === 0).length,
  years: Object.values(remarkYears)
    .map((y) => ({ ...y, avg: Math.round((y.sum / y.n) * 100) / 100 }))
    .sort((a, b) => a.year.localeCompare(b.year)),
  latest: latestByExpert.sort((a, b) => b.ym.localeCompare(a.ym)),
};

const asOf =
  DATA.complex_grade.find((c) => c.source_as_of)?.source_as_of ?? macro.asOf ?? null;

const out = {
  asOf,
  window: zw[0] ? `${zw[0].window_start}~${zw[0].window_end}` : null,
  counts: {
    complexes: DATA.complex_grade.length,
    zones: DATA.zone_summary.length,
    sigungu: DATA.gu.length,
    households: DATA.region_grade.reduce((a, r) => a + (r.household_count ?? 0), 0),
  },
  gradeBands,
  gradeCutoffs: DATA.grade_cutoffs.map((g) => ({
    label: g.grade_label,
    min: g.minimum_score_100,
    max: g.maximum_score_100,
    pctFrom: g.top_percentile_from,
    pctTo: g.top_percentile_to,
  })),
  regions,
  macro,
  zones: zoneStats,
  policy,
  experts,
  coverage,
  source: "수도권 주택시장 분석기 v3.0 (국토부 실거래·K-apt·생활권계획)",
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`요약 저장: src/data/realestate-summary.json (${kb}KB)`);
console.log(`기준 ${out.asOf} · 단지 ${out.counts.complexes} · 생활권 ${out.counts.zones} · 시군구 ${out.counts.sigungu}`);
console.log(`거시 ${macro.asOf} ${macro.status} · 기준금리 ${macro.baseRate}% · 국고3년 ${macro.treasury3y}%`);
console.log(`생활권 평단가 중앙 ${zoneStats.medianPyeong}만원 · 최고 ${zoneStats.topPrice[0]?.zone} ${zoneStats.topPrice[0]?.pyeong}만원`);
console.log(`정책 ${policy.count}건(${policy.range?.[0]}~${policy.range?.[1]}) · 전문가 ${experts.count}인 컨센서스 ${experts.consensusNow} (강세 ${experts.bullish}/약세 ${experts.bearish})`);
