// ETF 데이터 (네이버 금융) → src/data/etf.json
// 거래량 상위 50 (인버스·레버리지2X 제외) + 테마 태깅 + 테마 집계
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TOP_N = 50;

async function loadRaw() {
  const p = path.join(ROOT, "data/_naveretf.json");
  let buf;
  try {
    const r = await fetch("https://finance.naver.com/api/sise/etfItemList.nhn", {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.naver.com/sise/etf.naver" },
    });
    buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 1000) fs.writeFileSync(p, buf);
    else throw new Error("empty");
  } catch {
    buf = fs.readFileSync(p); // 폴백: 캐시
  }
  return JSON.parse(new TextDecoder("euc-kr").decode(buf));
}

// 인버스·레버리지(2X/3X) 제외
const EXCLUDE = /인버스|레버리지|곱버스|[23]X\b|２Ｘ/i;

// 테마 태깅 (우선순위 순)
const THEMES = [
  ["반도체", /반도체|HBM/i],
  ["AI·전력", /AI|인공지능|전력|데이터센터/i],
  ["2차전지", /2차전지|배터리|전지/i],
  ["로봇", /로봇|휴머노이드/i],
  ["방산", /방산|우주|항공/i],
  ["조선", /조선/i],
  ["바이오", /바이오|헬스|제약/i],
  ["자동차", /자동차|모빌리티/i],
  ["배당·커버드콜", /배당|커버드콜|리츠/i],
  ["미국·해외", /미국|S&P|나스닥|글로벌|차이나|인도|일본|유럽/i],
  ["채권·혼합", /채권|혼합|금리/i],
  ["코스닥", /코스닥/i],
  ["코스피·대형", /200|코스피|TOP10|코리아|대형/i],
];
function themeOf(name) {
  for (const [t, re] of THEMES) if (re.test(name)) return t;
  return "기타";
}

const num = (v) => (Number.isFinite(v) ? v : null);

const raw = await loadRaw();
const all = raw.result.etfItemList;
const eligible = all.filter((e) => !EXCLUDE.test(e.itemname));
const top = [...eligible].sort((a, b) => b.quant - a.quant).slice(0, TOP_N);

const etfs = top.map((e, i) => ({
  rank: i + 1,
  code: e.itemcode,
  name: e.itemname.trim(),
  theme: themeOf(e.itemname),
  price: num(e.nowVal),
  changeRate: num(e.changeRate),
  nav: num(e.nav),
  ret3m: num(e.threeMonthEarnRate),
  volume: num(e.quant), // 거래량(주)
  amount: num(e.amonut), // 거래대금(백만원)
  marketSum: num(e.marketSum), // 순자산/시총(억원)
}));

// 테마 집계
const themeMap = new Map();
for (const e of etfs) {
  if (!themeMap.has(e.theme)) themeMap.set(e.theme, { theme: e.theme, count: 0, amount: 0, rets: [], etfs: [] });
  const t = themeMap.get(e.theme);
  t.count++;
  t.amount += e.amount ?? 0;
  if (e.ret3m != null) t.rets.push(e.ret3m);
  t.etfs.push(e.name);
}
const themes = [...themeMap.values()]
  .map((t) => ({
    theme: t.theme,
    count: t.count,
    amount: Math.round(t.amount),
    avgRet: t.rets.length ? Math.round((t.rets.reduce((a, b) => a + b, 0) / t.rets.length) * 10) / 10 : null,
    etfs: t.etfs,
  }))
  .sort((a, b) => b.amount - a.amount);

const now = new Date();
const out = {
  source: "네이버 금융 ETF 시세 (실시간)",
  asOf: now.toISOString().slice(0, 10),
  asOfTime: now.toISOString().slice(0, 16).replace("T", " "),
  universe: all.length,
  eligible: eligible.length,
  excluded: all.length - eligible.length,
  topN: TOP_N,
  etfs,
  themes,
};
fs.writeFileSync(path.join(ROOT, "src/data/etf.json"), JSON.stringify(out, null, 1));

console.log(`전체 ${all.length} → 인버스·2X 제외 ${eligible.length} → 상위 ${TOP_N}`);
console.log("테마:", themes.map((t) => `${t.theme}(${t.count})`).join(", "));
console.log("상위5:", etfs.slice(0, 5).map((e) => `${e.name}[${e.theme}] ${(e.volume / 1e6).toFixed(1)}M`).join(", "));
