// [실시간 레이더 — 베이스라인] 라이브 D² 계산에 필요한 전일 기준값을 저장(커밋용).
//   /api/radar/live 가 네이버 실시간(현재가·고저·누적거래량)과 합쳐 온도를 계산하므로,
//   변하지 않는 기준(전일종가·20일 거래량중앙값·20일 변동성·시총·테마·시장)만 미리 굳혀둔다.
//   universe = 코스피 200 + 코스닥 50 (build-radar와 동일 선택).
import fs from "node:fs";
import path from "node:path";
import { tossGet, stocksBatch, hasToss, sleep } from "./toss.mjs";

const ROOT = process.cwd();
if (!hasToss) { console.error("토스 키 없음(.env.local)"); process.exit(0); }
const stocksData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/etf-stocks.json"), "utf8"));
const marketMap = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/stock-markets.json"), "utf8"));
const KOSPI_N = 200, KOSDAQ_N = 50;
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// universe 선택 (etf 노출순, 코스피200+코스닥50)
const sel = []; let nK = 0, nQ = 0;
for (const s of stocksData.stocks) {
  const mk = marketMap[s.code];
  if (mk === "KOSPI" && nK < KOSPI_N) { sel.push(s); nK++; }
  else if (mk === "KOSDAQ" && nQ < KOSDAQ_N) { sel.push(s); nQ++; }
  if (nK >= KOSPI_N && nQ >= KOSDAQ_N) break;
}
console.log(`마스터 수집... (코스피 ${nK} + 코스닥 ${nQ})`);
const master = await stocksBatch(sel.map((s) => s.code));
const todayKST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD

const out = {};
let done = 0, skip = 0;
for (const s of sel) {
  let bars = [];
  try { const j = await tossGet(`/api/v1/candles?symbol=${s.code}&interval=1d&count=60`); bars = ((j.result && j.result.candles) || []).slice().reverse(); } catch {}
  await sleep(110); done++;
  // 장중이면 마지막 봉이 오늘 미완성 → 베이스라인은 '완료된 세션'만 사용
  if (bars.length && String(bars[bars.length - 1].timestamp).slice(0, 10) === todayKST) bars = bars.slice(0, -1);
  if (bars.length < 22) { skip++; continue; }
  const C = bars.map((b) => num(b.closePrice)), V = bars.map((b) => num(b.volume));
  const n = C.length;
  const rets = C.map((v, i) => (i === 0 ? 0 : (v - C[i - 1]) / (C[i - 1] || 1)));
  const m = master[s.code];
  out[s.code] = {
    code: s.code, name: s.name, theme: s.themes?.[0] ?? "기타", market: marketMap[s.code] || "KOSPI",
    prevClose: C[n - 1],                                  // 전일 종가(라이브 등락 기준)
    medVol20: median(V.slice(-20)),                       // 20일 거래량 중앙값
    vol20: r3(std(rets.slice(-20)) * 100),                // 20일 변동성%(정적)
    mktCap: m ? r3(C[n - 1] * num(m.sharesOutstanding) / 1e12) : null,
  };
  if (done % 20 === 0 || done === sel.length) process.stdout.write(`\r베이스라인 ${done}/${sel.length}`);
}
console.log("");
const result = { asOf: stocksData.asOf, kospi: nK, kosdaq: nQ, count: Object.keys(out).length, byCode: out };
fs.writeFileSync(path.join(ROOT, "src/data/radar-baseline.json"), JSON.stringify(result));
console.log(`베이스라인 ${result.count}종목(스킵 ${skip}) → src/data/radar-baseline.json`);
const sx = out["005930"]; if (sx) console.log("삼성전자:", JSON.stringify(sx));
