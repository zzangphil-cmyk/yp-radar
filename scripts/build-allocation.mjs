// 국민연금 자산배분 (국내/해외 비중) → src/data/nps-allocation.json
// 출처: data.go.kr 기금 포트폴리오 현황(월별). 단위 십억원 → 조 환산.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ATCH = "FILE_000000003647207"; // 기금 포트폴리오 현황_20260228

async function load() {
  const p = path.join(ROOT, "data/_alloc.csv");
  let buf;
  if (fs.existsSync(p)) buf = fs.readFileSync(p);
  else {
    const r = await fetch(`https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=${ATCH}&fileDetailSn=1&insertDataPrcus=N`);
    buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(p, buf);
  }
  return new TextDecoder("euc-kr").decode(buf);
}

const txt = await load();
const lines = txt.split(/\r?\n/).filter((x) => x.trim());
const header = lines[0].split(",");
// 컬럼: 0구분, 1현황(=최신 중복), 2~ 기간들
const periodCols = header.slice(2).map((h) => h.replace(/\(.*?\)/g, "").trim());
// "2026년 2월" → "2026.02", "2025년" → "2025"
const periods = periodCols.map((p) => {
  const ym = p.match(/(\d{4})년\s*(\d{1,2})월/);
  if (ym) return `${ym[1]}.${ym[2].padStart(2, "0")}`;
  const y = p.match(/(\d{4})/);
  return y ? y[1] : p;
});

const rowMap = {};
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(",");
  const key = c[0].trim();
  rowMap[key] = c.slice(2).map((v) => Number(v.replace(/[,\s]/g, "")) / 1000); // 십억→조
}

const totalKey = Object.keys(rowMap).find((k) => k.includes("전체 자산"));
const totals = rowMap[totalKey];

const ASSET_DEFS = [
  ["국내주식", "금융부문(국내주식)"],
  ["해외주식", "금융부문(해외주식)"],
  ["국내채권", "금융부문(국내채권)"],
  ["해외채권", "금융부문(해외채권)"],
  ["대체투자", "금융부문(대체투자)"],
  ["단기자금", "금융부문(단기자금)"],
];
const assets = ASSET_DEFS.filter(([, k]) => rowMap[k]).map(([name, k]) => ({
  name,
  jo: rowMap[k].map((v) => Math.round(v * 10) / 10),
  pct: rowMap[k].map((v, i) => Math.round((v / totals[i]) * 1000) / 10),
}));

// 시간순 정렬(과거→최신): periods 역순
const order = periods.map((_, i) => i).reverse();
const reorder = (a) => order.map((i) => a[i]);

const out = {
  source: "국민연금공단 기금 포트폴리오 현황 (data.go.kr, 월별·시장가)",
  asOf: periods[0], // 최신
  periods: reorder(periods),
  totalsJo: reorder(totals).map((v) => Math.round(v * 10) / 10),
  assets: assets.map((a) => ({ name: a.name, jo: reorder(a.jo), pct: reorder(a.pct) })),
};
fs.writeFileSync(path.join(ROOT, "src/data/nps-allocation.json"), JSON.stringify(out, null, 1));

console.log("기간:", out.periods.join(", "));
const dom = out.assets.find((a) => a.name === "국내주식");
const ovs = out.assets.find((a) => a.name === "해외주식");
console.log("국내주식 비중%:", dom.pct.join(", "));
console.log("해외주식 비중%:", ovs.pct.join(", "));
console.log("총자산(조):", out.totalsJo.join(", "));
