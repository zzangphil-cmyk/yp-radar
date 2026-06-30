// [실시간 레이더] 네이버 실시간 폴링(키 불필요) + 베이스라인 → 라이브 D² 온도 프레임.
//   장중 분단위 폴링 대상. 키 없음(공개 엔드포인트) · 서버에서만 외부 호출.
//   ※ 예측 아님. 온도=지금 평소와 얼마나 다른가(이상강도). build-radar와 동일 모델(시장 내 z, Ledoit-Wolf D²).
import baseline from "@/data/radar-baseline.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOL_EDGE = 3.2, RET_DAILY = 14, DF = 5, TEMP_CEIL = 100;
const FEAT_GROUP = [0, 1, 2, 2, 3];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

function madZByGroup(arr: number[], grp: string[]) {
  const g: Record<string, number[]> = {}; arr.forEach((v, i) => { (g[grp[i]] ??= []).push(v); });
  const med: Record<string, number> = {}, sc: Record<string, number> = {};
  for (const k in g) { const m = median(g[k]); med[k] = m; sc[k] = (median(g[k].map((x) => Math.abs(x - m))) * 1.4826) || 1e-9; }
  return arr.map((v, i) => (v - med[grp[i]]) / sc[grp[i]]);
}
function pctRankByGroup(arr: number[], grp: string[]) {
  const g: Record<string, number[]> = {}; arr.forEach((v, i) => { (g[grp[i]] ??= []).push(v); });
  const sorted: Record<string, number[]> = {}; for (const k in g) sorted[k] = [...g[k]].sort((a, b) => a - b);
  return arr.map((v, i) => { const s = sorted[grp[i]]; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; } return Math.round(lo / s.length * 100); });
}
function inv(A: number[][]) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}

async function naverBatch(codes: string[]) {
  const out: Record<string, Record<string, unknown>> = {};
  const H = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.naver.com/" } };
  for (let i = 0; i < codes.length; i += 50) {
    const chunk = codes.slice(i, i + 50);
    try {
      const r = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${chunk.join(",")}`, H);
      const j = await r.json();
      for (const d of (j?.datas ?? [])) out[String(d.itemCode)] = d;
    } catch { /* chunk 실패 시 해당 종목 제외 */ }
  }
  return out;
}

export async function GET() {
  const by = (baseline as { byCode: Record<string, { code: string; name: string; theme: string; market: string; prevClose: number; medVol20: number; vol20: number; mktCap: number | null }> }).byCode;
  const codes = Object.keys(by);
  const live = await naverBatch(codes);

  // 장중 경과 비율(09:00~15:30=390분) — 누적거래량 페이스 보정
  const hm = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const hh = Number(hm.find((p) => p.type === "hour")?.value ?? 12), mm = Number(hm.find((p) => p.type === "minute")?.value ?? 0);
  const elapsed = clamp(hh * 60 + mm - 540, 10, 390); const frac = elapsed / 390;

  const sel = codes.filter((c) => live[c]);
  const stocks = sel.map((c) => ({ code: c, name: by[c].name, theme: by[c].theme, market: by[c].market }));
  const market = sel.map((c) => by[c].market);
  const theme = sel.map((c) => by[c].theme);
  const logMkt = sel.map((c) => Math.log((by[c].mktCap || 0.01) + 1e-6));

  const ret1 = sel.map((c) => num(live[c].fluctuationsRatio));
  const relVol = sel.map((c) => (num(live[c].accumulatedTradingVolume) + 1) / (by[c].medVol20 * frac + 1)); // 페이스 보정
  // 전일종가는 네이버 시세에서 역산(close/(1+등락%)) → 베이스라인 날짜와 무관하게 정확. 실패 시 베이스라인 폴백.
  const range = sel.map((c, i) => { const close = num(live[c].closePrice); const pc = ret1[i] > -100 && close ? close / (1 + ret1[i] / 100) : (by[c].prevClose || close || 1); return (num(live[c].highPrice) - num(live[c].lowPrice)) / (pc || 1) * 100; });
  const vol20 = sel.map((c) => by[c].vol20 || 0);
  const turnover = sel.map((c) => num(live[c].accumulatedTradingValue) / 100); // 백만→억

  // 고유수익(시장·섹터 통제)
  const mkt = mean(ret1);
  const thS: Record<string, number> = {}, thN: Record<string, number> = {};
  ret1.forEach((r, i) => { const t = theme[i]; thS[t] = (thS[t] || 0) + r; thN[t] = (thN[t] || 0) + 1; });
  const specRet = ret1.map((r, i) => r - thS[theme[i]] / thN[theme[i]]);
  // 자금유입 = log(turnover) ⊥ log(mktCap)
  const lt = turnover.map((v) => Math.log((v || 0) + 1));
  const mx = mean(logMkt), my = mean(lt);
  let sxx = 0, sxy = 0; for (let i = 0; i < sel.length; i++) { sxx += (logMkt[i] - mx) ** 2; sxy += (logMkt[i] - mx) * (lt[i] - my); }
  const beta = sxy / (sxx || 1e-9);
  const flow = lt.map((v, i) => v - (my + beta * (logMkt[i] - mx)));

  const N = sel.length;
  const Z = [madZByGroup(relVol, market), madZByGroup(specRet.map(Math.abs), market), madZByGroup(vol20, market), madZByGroup(range, market), madZByGroup(flow.map(Math.abs), market)];
  const p = 5;
  const C: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { let s = 0; for (let i = 0; i < N; i++) s += Z[a][i] * Z[b][i]; C[a][b] = s / N; }
  const alpha = clamp(0.1 + p / N, 0.1, 0.5);
  const S = C.map((row, a) => row.map((v, b) => (a === b ? v : (1 - alpha) * v)));
  const Si = inv(S);
  const pcs = [pctRankByGroup(relVol, market), pctRankByGroup(specRet.map(Math.abs), market), pctRankByGroup(vol20, market), pctRankByGroup(range, market), pctRankByGroup(flow.map(Math.abs), market)];

  // 축 원점 = 그날 횡단면 평균(중앙값): 점은 '평균 종목 대비' 상대 위치
  const Larr = relVol.map((v) => Math.log2(Math.max(v, 1e-6)));
  const Lmed = median(Larr), Rmed = median(ret1);
  const b: (number | number[])[][] = [];
  for (let i = 0; i < N; i++) {
    let q = 0; for (let a = 0; a < p; a++) for (let bb = 0; bb < p; bb++) q += Z[a][i] * Si[a][bb] * Z[bb][i];
    const d2 = Math.max(0, q);
    const temp = clamp(Math.log(Math.max(d2, DF) / DF) / Math.log(TEMP_CEIL / DF), 0, 1);
    let mg = -1, mgi = 0; for (let a = 0; a < p; a++) { const az = Math.abs(Z[a][i]); if (az > mg) { mg = az; mgi = a; } }
    const x = clamp((Larr[i] - Lmed) / VOL_EDGE, -1, 1);
    const y = clamp((ret1[i] - Rmed) / RET_DAILY, -1, 1);
    b.push([i, r3(x), r3(y), r2(temp), r2(relVol[i]), r2(ret1[i]), r2(d2), FEAT_GROUP[mgi], [pcs[0][i], pcs[1][i], pcs[2][i], pcs[3][i], pcs[4][i]]]);
  }

  const open = sel.some((c) => String(live[c].marketStatus) === "OPEN");
  const ss = Number(hm.find((p) => p.type === "second")?.value ?? 0);
  const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const ts = `${label}:${String(ss).padStart(2, "0")}`;
  return new Response(JSON.stringify({ asOf: (baseline as { asOf: string }).asOf, t: label, ts, open, frac: r2(frac), count: N, stocks, frame: { t: label, b } }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=20, stale-while-revalidate=20" },
  });
}
