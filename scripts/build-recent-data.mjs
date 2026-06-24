// 국민연금 "최근 동향" 데이터 (DART 실시간 대량보유) → src/data/nps-recent.json
// - 현재 5%+ 보유: data.go.kr 2025 보고내역(universe) × DART majorstock 최신
// - 최근 매매: DART list.json 최근 ~85일 국민연금 대량보유 필링
// 사용: node scripts/build-recent-data.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const KEY = (fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
  .match(/DART_API_KEY=(.+)/)?.[1] || "").trim();
if (!KEY) throw new Error("DART_API_KEY 없음");

const slugify = (s) => s.replace(/\(주\)|주식회사|㈜/g, "").replace(/[\s/\\?#%&]/g, "").trim();
const norm = slugify;
const ymd = (s) => (s || "").replace(/\D/g, "");
const num = (v) => { const n = Number(String(v ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : null; };
const today = () => new Date();
const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const daysAgo = (n) => { const d = today(); d.setDate(d.getDate() - n); return fmt(d); };

// 패널 slug 집합 (종목 상세 링크 가능 여부)
const panel = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nps-panel.json"), "utf8"));
const panelSlugs = new Set(panel.stocks.map((s) => s.slug));

// 1) corpCode 인덱스 (상장사)
console.log("CORPCODE 파싱…");
const xml = fs.readFileSync(path.join(ROOT, "data/CORPCODE.xml"), "utf8");
const nameToCode = new Map();
for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
  const b = m[1];
  const code = b.match(/<corp_code>(.*?)<\/corp_code>/)?.[1]?.trim();
  const name = b.match(/<corp_name>(.*?)<\/corp_name>/)?.[1]?.trim();
  const stock = b.match(/<stock_code>(.*?)<\/stock_code>/)?.[1]?.trim();
  if (!code || !name || !stock || stock.length < 6) continue;
  nameToCode.set(norm(name), { code, name, stock });
}

// 2) 2025 5%+ universe (data.go.kr 보고내역)
async function loadUniverse() {
  const p = path.join(ROOT, "data/_major2025.csv");
  let buf;
  if (fs.existsSync(p)) buf = fs.readFileSync(p);
  else {
    const r = await fetch("https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003618528&fileDetailSn=1&insertDataPrcus=N");
    buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(p, buf);
  }
  const t = new TextDecoder("euc-kr").decode(buf);
  const lines = t.split(/\r?\n/).filter((x) => x.trim());
  const rows = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 4) continue;
    const name = c[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, baseDate: c[2].trim(), ratio: num(c[3]) });
  }
  return rows;
}

async function majorstock(code) {
  try {
    const r = await fetch(`https://opendart.fss.or.kr/api/majorstock.json?crtfc_key=${KEY}&corp_code=${code}`);
    const j = await r.json();
    if (j.status !== "000") return [];
    return (j.list || [])
      .filter((x) => (x.repror || "").includes("국민연금"))
      .map((x) => ({ date: ymd(x.rcept_dt), ratio: num(x.stkrt), delta: num(x.stkrt_irds), reason: x.report_resn || "", rcept: x.rcept_no }))
      .filter((x) => x.date)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    process.stdout.write(`\r  ${Math.min(i + size, items.length)}/${items.length}`);
  }
  console.log("");
  return out;
}

// 3) 현재 5%+ 보유 (universe × DART 최신)
const universe = await loadUniverse();
console.log("5%+ universe:", universe.length);
const holdings = (await inBatches(universe, 6, async (u) => {
  const hit = nameToCode.get(norm(u.name));
  const recs = hit ? await majorstock(hit.code) : [];
  const latest = recs[0];
  const slug = norm(u.name);
  return {
    name: u.name.replace(/\s+$/,""),
    slug,
    inPanel: panelSlugs.has(slug),
    stockCode: hit?.stock ?? null,
    ownership: latest?.ratio ?? u.ratio,
    ownDelta: latest?.delta ?? null,
    reason: latest?.reason ?? null,
    date: latest?.date ?? ymd(u.baseDate),
  };
})).sort((a, b) => (b.ownership ?? 0) - (a.ownership ?? 0));

// 4) 최근 매매 (list.json 최근 85일 국민연금 대량보유)
console.log("최근 필링 조회…");
const recentRaw = [];
const bgn = daysAgo(85), end = fmt(today());
for (let p = 1; p <= 12; p++) {
  const r = await fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&bgn_de=${bgn}&end_de=${end}&pblntf_ty=D&page_no=${p}&page_count=100`);
  const j = await r.json();
  if (j.status !== "000") break;
  for (const it of (j.list || []))
    if ((it.flr_nm || "").includes("국민연금") && (it.report_nm || "").includes("대량보유"))
      recentRaw.push(it);
  if (p >= j.total_page) break;
}
// 중복 종목 제거(최신 1건) + majorstock로 증감/사유 보강
const byCorp = new Map();
for (const it of recentRaw) if (!byCorp.has(it.corp_code)) byCorp.set(it.corp_code, it);
const recentFilings = (await inBatches([...byCorp.values()], 6, async (it) => {
  const recs = await majorstock(it.corp_code);
  const m = recs.find((x) => x.rcept === it.rcept_no) ?? recs[0];
  const slug = norm(it.corp_name);
  return {
    name: it.corp_name, slug, inPanel: panelSlugs.has(slug),
    stockCode: it.stock_code || null,
    date: ymd(it.rcept_dt),
    ownership: m?.ratio ?? null,
    ownDelta: m?.delta ?? null,
    reason: m?.reason ?? it.report_nm,
  };
})).sort((a, b) => b.date.localeCompare(a.date));

const out = {
  asOf: fmt(today()),
  universeAsOf: "2025-12-31",
  source: "DART 전자공시 (국민연금 대량보유) + data.go.kr 5%+ 보고내역",
  counts: {
    holdings: holdings.length,
    recent: recentFilings.length,
    recentBuy: recentFilings.filter((r) => (r.ownDelta ?? 0) > 0).length,
    recentSell: recentFilings.filter((r) => (r.ownDelta ?? 0) < 0).length,
  },
  holdings,
  recentFilings,
};
fs.writeFileSync(path.join(ROOT, "src/data/nps-recent.json"), JSON.stringify(out, null, 1));
console.log("저장: src/data/nps-recent.json");
console.log("보유:", holdings.length, "| 최근 필링:", recentFilings.length, "| 최신일:", recentFilings[0]?.date);
console.log("최근 5건:", recentFilings.slice(0, 5).map((r) => `${r.name}(${r.date},${r.ownDelta ?? "?"})`).join(", "));
