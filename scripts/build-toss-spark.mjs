// 토스 캔들(1d) → 종목별 스파크라인 + 검증 등락률/3개월수익률 → src/data/toss-spark.json
// 대상: 50개 ETF + ETF 구성종목 전체(중복 제거)
import fs from "node:fs";
import path from "node:path";
import { candles, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) {
  console.error("토스 키 없음(.env.local) — 스킵");
  process.exit(0);
}

const etf = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf.json"), "utf8"));
const stocks = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const syms = [...new Set([...etf.etfs.map((e) => e.code), ...stocks.stocks.map((s) => s.code)])];

const SPARK_N = 30; // 표시용 포인트(거래일)
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

const out = {};
let done = 0, ok = 0;
for (const code of syms) {
  try {
    const c = await candles(code, 90); // [최신 ... 과거]
    const closes = c.map((x) => Number(x.closePrice)).filter(Number.isFinite);
    if (closes.length >= 2) {
      const last = closes[0], prev = closes[1];
      const change = prev ? ((last - prev) / prev) * 100 : null;
      const i3 = Math.min(closes.length - 1, 62); // ~3개월(거래일)
      const ret3m = closes[i3] ? ((last - closes[i3]) / closes[i3]) * 100 : null;
      const spark = closes.slice(0, SPARK_N).reverse(); // 과거→최신
      out[code] = { last, change: r2(change), ret3m: r1(ret3m), spark };
      ok++;
    }
  } catch {
    /* 개별 실패는 건너뜀 */
  }
  done++;
  if (done % 25 === 0 || done === syms.length) process.stdout.write(`\r캔들 ${done}/${syms.length} (성공 ${ok})`);
  await sleep(110); // ~9 req/s (MARKET_DATA 10/s 미만)
}
console.log("");

fs.writeFileSync(
  path.join(ROOT, "src/data/toss-spark.json"),
  JSON.stringify({ asOf: etf.asOf, source: "토스인베스트 Open API (캔들 1d)", count: ok, bySymbol: out }, null, 0),
);
const s = out["005930"];
console.log(`저장 ${ok}/${syms.length}종목 | 삼성전자 last ${s?.last} change ${s?.change}% 3m ${s?.ret3m}% spark[${s?.spark.length}]`);
