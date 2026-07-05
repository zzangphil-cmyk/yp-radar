// [업종 매핑 — 토스증권 분류] 토스 종목 overview의 업종(displayName)을 종목별 수집
//   → src/data/stock-industry.json. 섹터·테마 ETF에 안 담긴 종목의 성좌·고유수익 분해용.
//   소스: wts-info-api.tossinvest.com (토스증권 웹, 키 불필요) · universe = radar-baseline 전체.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/radar-baseline.json"), "utf8")).byCode;
const codes = Object.keys(baseline);
const H = { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function industryOf(code) {
  try {
    const r = await fetch(`https://wts-info-api.tossinvest.com/api/v2/stock-infos/A${code}/overview`, H);
    const j = await r.json();
    return j?.result?.company?.industry?.displayName || null;
  } catch { return null; }
}

const out = {};
let done = 0, ok = 0;
for (const c of codes) {
  const name = await industryOf(c);
  if (name) { out[c] = name; ok++; }
  await sleep(90); done++;
  if (done % 30 === 0 || done === codes.length) process.stdout.write(`\r업종 ${done}/${codes.length} (성공 ${ok})`);
}
console.log("");
fs.writeFileSync(path.join(ROOT, "src/data/stock-industry.json"), JSON.stringify({ source: "tossinvest overview industry", count: ok, byCode: out }));
const dist = {};
Object.values(out).forEach((n) => { dist[n] = (dist[n] || 0) + 1; });
console.log(`토스 업종 ${ok}종목 · 업종 수 ${Object.keys(dist).length} → src/data/stock-industry.json`);
console.log("상위:", Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n}(${c})`).join(" "));
