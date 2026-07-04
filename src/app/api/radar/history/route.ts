// [장중 히스토리] 네이버 분봉으로 그날 개장~현재까지의 D² 프레임을 즉석 재구성.
//   용도: 사용자가 몇 시에 접속하든 그날 09:00부터의 움직임을 시딩(백필의 서버리스판).
//   ?d=YYYY-MM-DD (기본 오늘 KST). 반환 = DayRec {d, c, f[]} — 클라이언트 버퍼 포맷 그대로.
//   모델·원점은 live 라우트와 동일(시장 내 z · Ledoit-Wolf D² · 원점=그날 횡단면 평균).
import baseline from "@/data/radar-baseline.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // 250종목 분봉 동시수집(~5초) 여유

const VOL_EDGE = 3.2, RET_DAILY = 14, DF = 5, TEMP_CEIL = 100, RES_MIN = 3, SES = 391;
const FEAT_GROUP = [0, 1, 2, 2, 3];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
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
type MinRow = { localDateTime: string; currentPrice: number; highPrice: number; lowPrice: number; accumulatedTradingVolume: number };
const NH = { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" } };
async function naverMin(code: string, ymd: string): Promise<MinRow[]> {
  try {
    const r = await fetch(`https://api.stock.naver.com/chart/domestic/item/${code}/minute?count=420`, NH);
    const a = await r.json();
    return Array.isArray(a) ? a.filter((x: MinRow) => String(x.localDateTime).slice(0, 8) === ymd) : [];
  } catch { return []; }
}
// 전일종가 = 실시간 폴링의 close/(1+등락%) 역산 — 베이스라인이 며칠 묵어도 최근 세션 기준이 정확
async function prevCloseMap(codes: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const pf = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
  for (let i = 0; i < codes.length; i += 50) {
    try {
      const r = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${codes.slice(i, i + 50).join(",")}`, NH);
      const j = await r.json();
      for (const d of (j?.datas ?? [])) { const close = pf(d.closePrice), ratio = pf(d.fluctuationsRatio); if (close && ratio > -100) out[String(d.itemCode)] = close / (1 + ratio / 100); }
    } catch { /* 폴백: 베이스라인 */ }
  }
  return out;
}

export async function GET(req: Request) {
  const by = (baseline as { byCode: Record<string, { code: string; name: string; theme: string; market: string; prevClose: number; medVol20: number; vol20: number; mktCap: number | null }> }).byCode;
  const codes = Object.keys(by);
  const url = new URL(req.url);
  const DATE = url.searchParams.get("d") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const ymd = DATE.replace(/-/g, "");

  // 250종목 분봉 동시 수집(동시성 20)
  const series: Record<string, ({ close: number; runHigh: number; runLow: number; accVol: number } | null)[]> = {};
  let cursor = 0;
  async function worker() {
    while (cursor < codes.length) {
      const c = codes[cursor++];
      const rows = await naverMin(c, ymd);
      if (!rows.length) continue;
      const arr: ({ close: number; runHigh: number; runLow: number; accVol: number } | null)[] = new Array(SES).fill(null);
      let rh = -Infinity, rl = Infinity, cum = 0;
      for (const x of rows) {
        const hh = String(x.localDateTime).slice(8, 12); const mi = (+hh.slice(0, 2)) * 60 + (+hh.slice(2)) - 540;
        if (mi < 0 || mi >= SES) continue;
        rh = Math.max(rh, num(x.highPrice)); rl = Math.min(rl, num(x.lowPrice));
        cum += num(x.accumulatedTradingVolume); // 분당 거래량 → 누적 합산
        arr[mi] = { close: num(x.currentPrice), runHigh: rh, runLow: rl, accVol: cum };
      }
      let prev: typeof arr[number] = null; for (let i = 0; i < SES; i++) { if (arr[i]) prev = arr[i]; else if (prev) arr[i] = prev; }
      series[c] = arr;
    }
  }
  const pcmPromise = prevCloseMap(codes);
  await Promise.all(Array.from({ length: 20 }, worker));
  const pcm = await pcmPromise;

  const present = codes.filter((c) => series[c]);
  if (!present.length) return new Response(JSON.stringify({ d: DATE, c: [], f: [] }), { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" } });
  const theme = present.map((c) => by[c].theme ?? "기타");
  const market = present.map((c) => by[c].market || "KOSPI");
  const logMkt = present.map((c) => Math.log((by[c].mktCap || 0.01) + 1e-6));
  // 데이터가 있는 마지막 분까지만 프레임 생성
  let lastMi = 0; for (const c of present) { const arr = series[c]; for (let i = SES - 1; i >= 0; i--) if (arr[i]) { if (i > lastMi) lastMi = i; break; } }

  const frames: { t: string; ts: string; o: boolean; v: (number | number[])[][] }[] = [];
  for (let mi = 0; mi <= lastMi; mi += RES_MIN) {
    const pcOf = (i: number) => pcm[present[i]] || by[present[i]].prevClose || 1;
    const row = present.map((c, i) => series[c][mi] || { close: pcOf(i), runHigh: pcOf(i), runLow: pcOf(i), accVol: 0 });
    const frac = clamp(mi + 1, 10, 390) / 390;
    const ret1 = row.map((d, i) => { const pc = pcOf(i); return (d.close - pc) / pc * 100; });
    const relVol = row.map((d, i) => (d.accVol + 1) / (by[present[i]].medVol20 * frac + 1));
    const range = row.map((d, i) => { const pc = pcOf(i); return (d.runHigh - d.runLow) / pc * 100; });
    const vol20 = present.map((c) => by[c].vol20 || 0);
    const turnover = row.map((d) => d.close * d.accVol / 1e8);
    const N = present.length;
    const thS: Record<string, number> = {}, thN: Record<string, number> = {};
    ret1.forEach((r, i) => { const t = theme[i]; thS[t] = (thS[t] || 0) + r; thN[t] = (thN[t] || 0) + 1; });
    const specRet = ret1.map((r, i) => r - thS[theme[i]] / thN[theme[i]]);
    const lt = turnover.map((v) => Math.log((v || 0) + 1)); const mx = mean(logMkt), my = mean(lt);
    let sxx = 0, sxy = 0; for (let i = 0; i < N; i++) { sxx += (logMkt[i] - mx) ** 2; sxy += (logMkt[i] - mx) * (lt[i] - my); }
    const beta = sxy / (sxx || 1e-9); const flow = lt.map((v, i) => v - (my + beta * (logMkt[i] - mx)));
    const Z = [madZByGroup(relVol, market), madZByGroup(specRet.map(Math.abs), market), madZByGroup(vol20, market), madZByGroup(range, market), madZByGroup(flow.map(Math.abs), market)];
    const p = 5; const C: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { let s = 0; for (let i = 0; i < N; i++) s += Z[a][i] * Z[b][i]; C[a][b] = s / N; }
    const alpha = clamp(0.1 + p / N, 0.1, 0.5); const S = C.map((rw, a) => rw.map((v, b) => (a === b ? v : (1 - alpha) * v))); const Si = inv(S);
    const pcs = [pctRankByGroup(relVol, market), pctRankByGroup(specRet.map(Math.abs), market), pctRankByGroup(vol20, market), pctRankByGroup(range, market), pctRankByGroup(flow.map(Math.abs), market)];
    const Larr = relVol.map((v) => Math.log2(Math.max(v, 1e-6)));
    const Lmed = median(Larr), Rmed = median(ret1); // 원점=그날 횡단면 평균
    const v: (number | number[])[][] = [];
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
  return new Response(JSON.stringify({ d: DATE, c: present, f: frames }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
  });
}
