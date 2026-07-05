// [업종 매핑] 네이버 업종(산업분류)명을 종목별로 수집 → src/data/stock-industry.json
//   용도: 섹터·테마 ETF에 안 담겨 "코스피·대형/코스닥" 버킷에 남는 종목에 실제 업종을 붙여
//   3D 성좌·고유수익 분해의 테마 품질을 올린다. universe = radar-baseline 종목 전체.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/radar-baseline.json"), "utf8")).byCode;
const codes = Object.keys(baseline);
const H = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const indName = {}; // industryCode → 업종명(캐시)
async function industryOf(code) {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, H);
    const j = await r.json();
    const ic = j.industryCode;
    if (ic == null) return null;
    if (!(ic in indName)) {
      const r2 = await fetch(`https://m.stock.naver.com/api/stocks/industry/${ic}?page=1&pageSize=1`, H);
      const j2 = await r2.json();
      indName[ic] = j2?.groupInfo?.name || null;
      await sleep(60);
    }
    return indName[ic];
  } catch { return null; }
}

const out = {};
let done = 0, ok = 0;
for (const c of codes) {
  const name = await industryOf(c);
  if (name) { out[c] = name; ok++; }
  await sleep(70); done++;
  if (done % 30 === 0 || done === codes.length) process.stdout.write(`\r업종 ${done}/${codes.length} (성공 ${ok})`);
}
console.log("");
fs.writeFileSync(path.join(ROOT, "src/data/stock-industry.json"), JSON.stringify({ count: ok, byCode: out }));
const dist = {};
Object.values(out).forEach((n) => { dist[n] = (dist[n] || 0) + 1; });
console.log(`업종 ${ok}종목 · 업종 수 ${Object.keys(dist).length} → src/data/stock-industry.json`);
console.log("상위:", Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n}(${c})`).join(" "));
