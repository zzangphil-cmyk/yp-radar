// [장중 기록 백필] 네이버 분봉으로 특정 날짜의 장중 D² 프레임을 재구성 → public/live/<날짜>.json
//   라이브 기록기를 못 돌린 날(오늘 포함)을 사후 복원. 네이버가 분봉을 주는 최근 며칠만 가능.
//   호출: node scripts/backfill-day.mjs [YYYY-MM-DD]   (기본: 오늘 KST). AUTOCOMMIT=1 시 커밋·푸시.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/radar-baseline.json"), "utf8")).byCode;
const RES_MIN = Number(process.env.RES_MIN) || 3;
const AUTOCOMMIT = process.env.AUTOCOMMIT === "1";
const DATE = process.argv[2] || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const DIR = path.join(ROOT, "public", "live");
fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
function madZByGroup(arr, grp) { const g = {}; arr.forEach((v, i) => { (g[grp[i]] ??= []).push(v); }); const med = {}, sc = {}; for (const k in g) { const m = median(g[k]); med[k] = m; sc[k] = (median(g[k].map((x) => Math.abs(x - m))) * 1.4826) || 1e-9; } return arr.map((v, i) => (v - med[grp[i]]) / sc[grp[i]]); }
function pctRankByGroup(arr, grp) { const g = {}; arr.forEach((v, i) => { (g[grp[i]] ??= []).push(v); }); const s = {}; for (const k in g) s[k] = [...g[k]].sort((a, b) => a - b); return arr.map((v, i) => { const a = s[grp[i]]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m; } return Math.round(lo / a.length * 100); }); }
function inv(A) { const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;[M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-9; for (let j = 0; j < 2 * n; j++) M[c][j] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } } return M.map((r) => r.slice(n)); }

const VOL_EDGE = 3.2, RET_DAILY = 14, DF = 5, TEMP_CEIL = 100, FEAT_GROUP = [0, 1, 2, 2, 3];
const codes = Object.keys(baseline);
const ymd = DATE.replace(/-/g, "");

async function naverMin(code) {
  const H = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" } };
  try { const r = await fetch(`https://api.stock.naver.com/chart/domestic/item/${code}/minute?count=420`, H); const a = await r.json(); return Array.isArray(a) ? a.filter((x) => String(x.localDateTime).slice(0, 8) === ymd) : []; }
  catch { return []; }
}
// fchart(레거시): 며칠 전 분봉까지 보관(약 6거래일). 형식 "YYYYMMDDHHMM|o|h|l|close|분당vol" (o/h/l null 가능)
async function fchartMin(code) {
  const H = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.naver.com/" } };
  try {
    const r = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=minute&count=2800&requestType=0`, H);
    const t = await r.text();
    return [...t.matchAll(/data="(\d{12})\|[^|]*\|[^|]*\|[^|]*\|(\d+)\|(\d+)"/g)]
      .filter((m) => m[1].slice(0, 8) === ymd)
      .map((m) => ({ localDateTime: m[1] + "00", currentPrice: +m[2], highPrice: +m[2], lowPrice: +m[2], accumulatedTradingVolume: +m[3] }));
  } catch { return []; }
}
// 그날 기준의 정확한 베이스(전일종가·20일 거래량중앙값·변동성) — dayCandle에서 날짜별 산출
async function dayBase(code) {
  const H = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" } };
  try {
    const r = await fetch(`https://api.stock.naver.com/chart/domestic/item/${code}?periodType=dayCandle&count=60`, H);
    const a = await r.json(); const rows = Array.isArray(a) ? a : (a.priceInfos || []);
    const idx = rows.findIndex((x) => String(x.localDate) === ymd);
    if (idx < 1) return null;
    const C = rows.slice(0, idx + 1).map((x) => Number(x.closePrice) || 0);
    const V = rows.slice(Math.max(0, idx - 20), idx).map((x) => Number(x.accumulatedTradingVolume) || 0);
    const rets = C.map((v, i) => (i === 0 ? 0 : (v - C[i - 1]) / (C[i - 1] || 1)));
    const sd = (arr) => { const m = arr.reduce((s, v) => s + v, 0) / (arr.length || 1); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length || 1)); };
    return { prevClose: C[C.length - 2], medVol20: median(V), vol20: r3(sd(rets.slice(-20)) * 100) };
  } catch { return null; }
}

// 종목별 세션(09:00~15:30, 391분) dense 배열: {close, runHigh, runLow, accVol}
console.log(`백필 ${DATE} · ${codes.length}종목 분봉 수집...`);
const SES = 391; // 0=09:00 ... 390=15:30
const num = (v) => Number(v) || 0;
const series = {}, base = {}; let got = 0, done = 0, viaF = 0;
for (const c of codes) {
  let rows = await naverMin(c); await sleep(60);
  if (!rows.length) { rows = await fchartMin(c); await sleep(60); if (rows.length) viaF++; } // 최근 세션이 아니면 fchart
  const db = await dayBase(c); await sleep(60);
  done++;
  if (rows.length && (db || baseline[c])) {
    base[c] = db || { prevClose: baseline[c].prevClose, medVol20: baseline[c].medVol20, vol20: baseline[c].vol20 };
    const arr = new Array(SES).fill(null);
    let rh = -Infinity, rl = Infinity, cum = 0;
    for (const x of rows) {
      const hh = String(x.localDateTime).slice(8, 12); const mi = (+hh.slice(0, 2)) * 60 + (+hh.slice(2)) - 540;
      if (mi < 0 || mi >= SES) continue;
      rh = Math.max(rh, num(x.highPrice)); rl = Math.min(rl, num(x.lowPrice));
      cum += num(x.accumulatedTradingVolume); // 네이버 분봉 값은 '분당 거래량' → 누적 합산
      arr[mi] = { close: num(x.currentPrice), runHigh: rh, runLow: rl, accVol: cum };
    }
    // forward-fill
    let prev = null; for (let i = 0; i < SES; i++) { if (arr[i]) prev = arr[i]; else if (prev) arr[i] = prev; }
    series[c] = arr; got++;
  }
  if (done % 30 === 0 || done === codes.length) process.stdout.write(`\r  수집 ${done}/${codes.length} (유효 ${got}, fchart ${viaF})`);
}
console.log("");

const present = codes.filter((c) => series[c]);
if (present.length < 30) { console.log(`분봉 데이터 부족(${present.length}종목) — ${DATE}는 휴장이거나 소스에 없음. 종료.`); process.exit(0); }
const theme = present.map((c) => baseline[c].theme ?? "기타");
const market = present.map((c) => baseline[c].market || "KOSPI");
const logMkt = present.map((c) => Math.log((baseline[c].mktCap || 0.01) + 1e-6));
const frames = [];
for (let mi = 0; mi < SES; mi += RES_MIN) {
  const row = present.map((c) => series[c][mi]).map((x, i) => x || { close: base[present[i]].prevClose, runHigh: base[present[i]].prevClose, runLow: base[present[i]].prevClose, accVol: 0 });
  const frac = clamp(mi + 1, 10, 390) / 390;
  const ret1 = row.map((d, i) => { const pc = base[present[i]].prevClose || 1; return (d.close - pc) / pc * 100; });
  const relVol = row.map((d, i) => (d.accVol + 1) / (base[present[i]].medVol20 * frac + 1));
  const range = row.map((d, i) => { const pc = base[present[i]].prevClose || 1; return (d.runHigh - d.runLow) / pc * 100; });
  const vol20 = present.map((c) => base[c].vol20 || 0);
  const turnover = row.map((d) => d.close * d.accVol / 1e8);
  const N = present.length;
  // 고유수익(섹터통제)
  const thS = {}, thN = {}; ret1.forEach((r, i) => { const t = theme[i]; thS[t] = (thS[t] || 0) + r; thN[t] = (thN[t] || 0) + 1; });
  const specRet = ret1.map((r, i) => r - thS[theme[i]] / thN[theme[i]]);
  // 자금유입
  const lt = turnover.map((v) => Math.log((v || 0) + 1)); const mx = mean(logMkt), my = mean(lt);
  let sxx = 0, sxy = 0; for (let i = 0; i < N; i++) { sxx += (logMkt[i] - mx) ** 2; sxy += (logMkt[i] - mx) * (lt[i] - my); }
  const beta = sxy / (sxx || 1e-9); const flow = lt.map((v, i) => v - (my + beta * (logMkt[i] - mx)));
  const Z = [madZByGroup(relVol, market), madZByGroup(specRet.map(Math.abs), market), madZByGroup(vol20, market), madZByGroup(range, market), madZByGroup(flow.map(Math.abs), market)];
  const p = 5; const C = Array.from({ length: p }, () => Array(p).fill(0));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { let s = 0; for (let i = 0; i < N; i++) s += Z[a][i] * Z[b][i]; C[a][b] = s / N; }
  const alpha = clamp(0.1 + p / N, 0.1, 0.5); const S = C.map((rw, a) => rw.map((v, b) => (a === b ? v : (1 - alpha) * v))); const Si = inv(S);
  const pcs = [pctRankByGroup(relVol, market), pctRankByGroup(specRet.map(Math.abs), market), pctRankByGroup(vol20, market), pctRankByGroup(range, market), pctRankByGroup(flow.map(Math.abs), market)];
  // 축 원점 = 그날 횡단면 평균(중앙값): 점은 '평균 종목 대비' 상대 위치
  const Larr = relVol.map((vv) => Math.log2(Math.max(vv, 1e-6)));
  const Lmed = median(Larr), Rmed = median(ret1);
  const v = [];
  for (let i = 0; i < N; i++) {
    let q = 0; for (let a = 0; a < p; a++) for (let bb = 0; bb < p; bb++) q += Z[a][i] * Si[a][bb] * Z[bb][i];
    const d2 = Math.max(0, q); const temp = clamp(Math.log(Math.max(d2, DF) / DF) / Math.log(TEMP_CEIL / DF), 0, 1);
    let mg = -1, mgi = 0; for (let a = 0; a < p; a++) { const az = Math.abs(Z[a][i]); if (az > mg) { mg = az; mgi = a; } }
    const x = clamp((Larr[i] - Lmed) / VOL_EDGE, -1, 1), y = clamp((ret1[i] - Rmed) / RET_DAILY, -1, 1);
    v.push([i, r3(x), r3(y), r2(temp), r2(relVol[i]), r2(ret1[i]), r2(d2), FEAT_GROUP[mgi], [pcs[0][i], pcs[1][i], pcs[2][i], pcs[3][i], pcs[4][i]]]);
  }
  const t = `${String(9 + Math.floor(mi / 60)).padStart(2, "0")}:${String(mi % 60).padStart(2, "0")}`;
  frames.push({ t, ts: t, o: true, v });
}

fs.writeFileSync(path.join(DIR, `${DATE}.json`), JSON.stringify({ d: DATE, c: present, f: frames }));
const dates = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", "")).sort().reverse().slice(0, 30);
fs.writeFileSync(path.join(DIR, "index.json"), JSON.stringify({ dates }));
console.log(`완료 · ${DATE} · ${present.length}종목 · ${frames.length}프레임(${RES_MIN}분) · index ${dates.length}일`);
const sz = Math.round(fs.statSync(path.join(DIR, `${DATE}.json`)).size / 1024);
console.log(`파일 ${sz}KB`);
if (AUTOCOMMIT) { try { execFileSync("git", ["add", "public/live"], { cwd: ROOT }); execFileSync("git", ["commit", "-m", `장중 기록 백필 ${DATE} (${frames.length}프레임)`], { cwd: ROOT }); execFileSync("git", ["push", "origin", "main"], { cwd: ROOT }); console.log("커밋·푸시 완료"); } catch (e) { console.log("커밋 실패:", String(e).slice(0, 120)); } }
