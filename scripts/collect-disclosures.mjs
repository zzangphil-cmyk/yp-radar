// [D²의 목표값 — 공시] 패널 기간 동안 종목별 DART 공시 이력 수집.
//   종목코드→corp_code(CORPCODE.xml) → DART list.json (기간 내 전체 공시) → data/disclosures.json
//   목적: 온도(D²)가 공시·이벤트를 감지/선행하는지 이벤트 스터디의 목표값.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const KEY = (fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/DART_API_KEY=(.+)/)?.[1] || "").trim();
if (!KEY) throw new Error("DART_API_KEY 없음");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const panel = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stock-panel.json"), "utf8"));
const codes = Object.keys(panel.panel);
// 패널 기간
const allDates = panel.panel[codes[0]].dates;
const bgn = allDates[0].replace(/-/g, ""), end = allDates[allDates.length - 1].replace(/-/g, "");
console.log(`기간 ${bgn}~${end} · 종목 ${codes.length}`);

// 1) CORPCODE: stock_code(6) → corp_code(8)
console.log("CORPCODE 파싱…");
const xml = fs.readFileSync(path.join(ROOT, "data/CORPCODE.xml"), "utf8");
const stockToCorp = new Map();
for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
  const b = m[1];
  const corp = b.match(/<corp_code>(.*?)<\/corp_code>/)?.[1]?.trim();
  const stock = b.match(/<stock_code>(.*?)<\/stock_code>/)?.[1]?.trim();
  if (corp && stock && stock.length === 6) stockToCorp.set(stock, corp);
}

// 2) DART list.json — 기간 내 전체 공시(페이지네이션)
async function listAll(corp) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&corp_code=${corp}&bgn_de=${bgn}&end_de=${end}&page_no=${page}&page_count=100`;
    let j;
    try { j = await (await fetch(url)).json(); } catch { break; }
    if (j.status !== "000") break; // 013=무자료
    for (const x of j.list || []) out.push({ date: (x.rcept_dt || "").trim(), name: (x.report_nm || "").trim(), flr: (x.flr_nm || "").trim() });
    if (page >= (j.total_page || 1)) break;
    await sleep(60);
  }
  return out;
}

const result = {};
let done = 0, noMap = 0, withDisc = 0, totalDisc = 0;
for (const code of codes) {
  const corp = stockToCorp.get(code);
  done++;
  if (!corp) { noMap++; result[code] = { corp: null, disc: [] }; continue; }
  const disc = await listAll(corp);
  result[code] = { corp, disc };
  if (disc.length) { withDisc++; totalDisc += disc.length; }
  if (done % 20 === 0 || done === codes.length) process.stdout.write(`\r수집 ${done}/${codes.length} (공시 ${totalDisc}건)`);
  await sleep(70);
}
console.log("");

const out = { bgn, end, count: codes.length, noMap, withDisc, totalDisc, byCode: result };
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/disclosures.json"), JSON.stringify(out));
console.log(`매핑실패 ${noMap} · 공시보유 ${withDisc}종목 · 총 ${totalDisc}건 → data/disclosures.json`);
// 공시명 상위(목표 정의용)
const freq = {};
for (const c in result) for (const d of result[c].disc) { const k = d.name.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim().slice(0, 20); freq[k] = (freq[k] || 0) + 1; }
console.log("공시명 빈도 TOP15:", Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}(${v})`).join(", "));
