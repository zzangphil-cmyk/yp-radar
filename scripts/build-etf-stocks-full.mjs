// KRX 전체 구성종목(노출) + Naver 순유입(자금흐름) 결합 → src/data/etf-stocks.json (전체판)
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const krx = JSON.parse(fs.readFileSync(path.join(ROOT, "data/etf-pdf-stocks.json"), "utf8"));
const old = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const etfMeta = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf.json"), "utf8"));

// ETF 코드 → 순유입(억), 이름, 테마
const inflow = {}, ename = {}, etheme = {};
for (const e of old.perEtf || []) inflow[e.code] = e.inflow3m ?? 0;
for (const e of etfMeta.etfs) { ename[e.code] = e.name; etheme[e.code] = e.theme; }

const stocks = krx.stocks.map((s) => {
  let flow = 0;
  const themes = new Set();
  const etfs = [];
  for (const [code, w] of s.etfs) {
    flow += (w / 100) * (inflow[code] ?? 0);
    if (etheme[code]) themes.add(etheme[code]);
    etfs.push({ name: ename[code] ?? code, weight: w });
  }
  return {
    code: s.code,
    name: s.name,
    etfCount: s.etfCount,
    exposure: s.exposure,
    flow: Math.round(flow),
    themes: [...themes],
    etfs: etfs.filter((e) => e.weight > 0).sort((a, b) => b.weight - a.weight),
  };
}).filter((s) => s.exposure > 0).sort((a, b) => b.exposure - a.exposure);

const out = {
  asOf: etfMeta.asOf,
  source: "KRX 전체 구성종목(PDF) × ETF 순자산 + Naver 순유입",
  count: stocks.length,
  etfCount: krx.etfCount,
  stocks,
};
fs.writeFileSync(path.join(ROOT, "src/data/etf-stocks.json"), JSON.stringify(out, null, 0));

const fl = stocks.map((s) => s.flow).sort((a, b) => a - b);
console.log("전체판 종목:", stocks.length, "(이전 TOP10집계 114 → KRX전체)");
console.log("노출 TOP5:", stocks.slice(0, 5).map((s) => `${s.name}(${(s.exposure / 10000).toFixed(1)}조/${s.etfCount}개)`).join(", "));
console.log("순유입 TOP3:", [...stocks].sort((a, b) => b.flow - a.flow).slice(0, 3).map((s) => `${s.name}(+${s.flow}억)`).join(", "));
console.log("유출 TOP3:", [...stocks].sort((a, b) => a.flow - b.flow).slice(0, 3).map((s) => `${s.name}(${s.flow}억)`).join(", "));
