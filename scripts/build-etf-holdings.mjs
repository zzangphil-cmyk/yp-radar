// ETF 구성종목(TOP10) + 순유입 수집 → 종목 단위 집계 → src/data/etf-stocks.json
// 입력: src/data/etf.json (거래량 상위 30 ETF, code/marketSum)
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const etfData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf.json"), "utf8"));
const H = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" } };

// "6,437억" / "-1,234억" / "1조2,345억" → 억(숫자)
function parseInflow(s) {
  if (!s) return null;
  const neg = /^-/.test(String(s));
  const t = String(s).replace(/[,\s]/g, "");
  let jo = 0, eok = 0;
  const jm = t.match(/(-?\d+)조/); if (jm) jo = Math.abs(+jm[1]);
  const em = t.match(/(\d+)억/); if (em) eok = +em[1];
  let v = jo * 10000 + eok;
  if (!jm && !em) { const n = Number(t.replace(/[^0-9.-]/g, "")); v = Number.isFinite(n) ? Math.abs(n) : 0; }
  return neg ? -v : v;
}
const pctNum = (s) => Number(String(s).replace(/[%,\s]/g, "")) || 0;

async function analysis(code) {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/etfAnalysis`, H);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const perEtf = [];
const stockMap = new Map(); // code -> {code,name, etfCount, exposure, flow, themes:Set, etfs:[]}

let done = 0;
for (let i = 0; i < etfData.etfs.length; i += 5) {
  const batch = etfData.etfs.slice(i, i + 5);
  const res = await Promise.all(batch.map(async (e) => ({ e, a: await analysis(e.code) })));
  for (const { e, a } of res) {
    if (!a) continue;
    const inflow3m = parseInflow(a.cumulativeNetInflowList?.cumulativeNetInflow3m);
    const top10 = (a.etfTop10MajorConstituentAssets || []).map((c) => ({
      code: c.itemCode, name: c.itemName, weight: pctNum(c.etfWeight),
    }));
    perEtf.push({ code: e.code, name: e.name, theme: e.theme, marketSum: e.marketSum, inflow3m, top10 });
    for (const c of top10) {
      if (!c.code) continue;
      if (!stockMap.has(c.code)) stockMap.set(c.code, { code: c.code, name: c.name, etfCount: 0, exposure: 0, flow: 0, themes: new Set(), etfs: [] });
      const s = stockMap.get(c.code);
      s.etfCount++;
      const w = c.weight / 100;
      s.exposure += w * (e.marketSum ?? 0); // 억
      if (inflow3m != null) s.flow += w * inflow3m; // 억
      s.themes.add(e.theme);
      s.etfs.push({ name: e.name, weight: c.weight });
    }
  }
  done += batch.length;
  process.stdout.write(`\r수집 ${done}/${etfData.etfs.length}`);
}
console.log("");

const stocks = [...stockMap.values()].map((s) => ({
  code: s.code, name: s.name, etfCount: s.etfCount,
  exposure: Math.round(s.exposure), flow: Math.round(s.flow),
  themes: [...s.themes], etfs: s.etfs.sort((a, b) => b.weight - a.weight),
})).sort((a, b) => b.exposure - a.exposure);

fs.writeFileSync(path.join(ROOT, "src/data/etf-stocks.json"),
  JSON.stringify({ asOf: etfData.asOf, source: "네이버 ETF 구성종목 TOP10 집계", count: stocks.length, etfCount: perEtf.length, stocks, perEtf }, null, 0));

// EDA
const ex = stocks.map((s) => s.exposure).sort((a, b) => a - b);
const fl = stocks.map((s) => s.flow).sort((a, b) => a - b);
const q = (a, p) => a[Math.floor(a.length * p)];
console.log("고유 종목:", stocks.length, "| ETF 수집:", perEtf.length);
console.log("노출(억) 33/66%:", q(ex, 0.33), q(ex, 0.66), "max:", ex[ex.length - 1]);
console.log("흐름(억) min/median/max:", fl[0], q(fl, 0.5), fl[fl.length - 1]);
console.log("노출 TOP8:", stocks.slice(0, 8).map((s) => `${s.name}(노출${s.exposure}/흐름${s.flow}/${s.etfCount}개)`).join(", "));
