"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { radarData, AXIS5, getTa, groupLabel } from "@/lib/radarData";

const NEUTRAL = "#5b6573", UP = "#f04452", DOWN = "#4c82fb", SELECT = "#22c55e", AMBER = "#f5a623";
const MUTED_UP = "#a06a73", MUTED_DOWN = "#6a73a0"; // 시장·섹터 동반: 옅은 방향 색조
const GROUP_LABELS = ["거래량", "고유수익", "변동성", "자금유입"]; // 온도(D²)를 띄운 주 원인
const HOT = 0.4, VOL_EDGE = 3.2, RET_DAILY = 14, DZ = 0.5;
const xTicks = [{ m: 1, l: "1배" }, { m: 2, l: "2배" }, { m: 4, l: "4배" }];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const LOGO_BG = ["#3182f6", "#f04452", "#f5a623", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b", "#0ea5e9"];
function CircleLogo({ name, on, size = 8 }: { name: string; on?: boolean; size?: number }) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const ko = name.replace(/^[A-Z]+\s*/, "").charAt(0);
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size * 4, height: size * 4, fontSize: 12, background: on ? SELECT : LOGO_BG[h % LOGO_BG.length] }}>
      {ko || name.charAt(0)}
    </span>
  );
}

export default function StockRadar() {
  const { stocks, frames, frameCount } = radarData;
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef({ animF: frameCount - 1, target: frameCount - 1, shown: frameCount - 1, dwell: 0, sweep: -Math.PI / 2, playing: false, last: 0 });
  const selRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number }[]>(stocks.map(() => ({ x: 0, y: 0 })));
  const [mode, setMode] = useState<"cum" | "daily" | "live">("daily");
  const [startIdx, setStartIdx] = useState(Math.max(0, frameCount - 5));
  const [endIdx, setEndIdx] = useState(frameCount - 1);
  const [playIdx, setPlayIdx] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // 실시간 버퍼: 1분마다 스냅샷을 누적 → 슬라이더·재생으로 장중 움직임 되돌려보기.
  type LiveFrame = { t: string; open: boolean; map: Record<string, number[]> };
  const [liveBuf, setLiveBuf] = useState<LiveFrame[]>([]);
  const followRef = useRef(true); // 최신 추종(끝에 있으면 새 프레임 도착 시 자동 이동)
  const liveLast = liveBuf[liveBuf.length - 1];

  useEffect(() => {
    if (mode !== "live") return;
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch("/api/radar/live", { cache: "no-store" });
        const j = await r.json();
        if (!alive || !j.stocks) return;
        const map: Record<string, number[]> = {};
        for (const bl of j.frame.b) map[j.stocks[bl[0]].code] = bl;
        const fr: LiveFrame = { t: j.t, open: j.open, map };
        setLiveBuf((prev) => {
          const next = [...prev];
          if (next.length && next[next.length - 1].t === fr.t) next[next.length - 1] = fr; // 같은 분 → 갱신
          else next.push(fr);
          if (next.length > 180) next.shift(); // 약 3시간 분량
          return next;
        });
      } catch { /* 폴링 실패 시 직전 버퍼 유지 */ }
    };
    pull(); const id = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [mode]);

  // 최신 추종: 끝을 보고 있으면 새 프레임으로 부드럽게 이동(이전 시점 보는 중이면 유지)
  useEffect(() => {
    if (mode === "live" && followRef.current && liveBuf.length) {
      const hi = liveBuf.length - 1; stRef.current.target = hi; setPlayIdx(hi);
    }
  }, [liveBuf.length, mode]);

  // 보기 데이터: 누적(시작일 대비) 또는 일일. 좌표·이상점수 산출.
  const view = useMemo(() => {
    const N = stocks.length;
    const calc = (avgVol: number, ret: number, retEdge: number) => {
      const x = clamp(Math.log2(Math.max(avgVol, 1e-6)) / VOL_EDGE, -1, 1);
      const y = clamp(ret / retEdge, -1, 1);
      const anomaly = clamp((Math.hypot(x, y) - DZ) / (1 - DZ), 0, 1);
      return [x, y, anomaly];
    };
    // [SBV-A] 시장·섹터 통제 후 고유 잔차 분해. ledBy: 0 고유 / 1 섹터 / 2 시장
    const themeOf = stocks.map((s) => s.theme ?? "기타");
    const ledOf = (mkt: number, secDev: number, spec: number) => {
      const am = Math.abs(mkt), as = Math.abs(secDev), ap = Math.abs(spec);
      const share = ap / (am + as + ap || 1e-9);
      const led = share >= 0.5 ? 0 : as >= am ? 1 : 2; // 고유는 점유율 50%+ 일 때만(엄격)
      return [led, spec, share];
    };
    const dMkt: Record<number, number> = {}, dSec: Record<number, Record<string, number>> = {};
    for (let d = startIdx; d <= endIdx; d++) {
      let m = 0; const ss: Record<string, number> = {}, sn: Record<string, number> = {};
      for (let i = 0; i < N; i++) { const r = frames[d].b[i][5]; m += r; const t = themeOf[i]; ss[t] = (ss[t] || 0) + r; sn[t] = (sn[t] || 0) + 1; }
      dMkt[d] = m / N; const sm: Record<string, number> = {}; for (const t in ss) sm[t] = ss[t] / sn[t]; dSec[d] = sm;
    }
    if (mode === "live") {
      // 실시간: 누적 버퍼의 각 스냅샷을 프레임으로(코드→blip 매핑, 인덱스는 정적 stocks 기준).
      const f: { t: string; b: (number | number[])[][] }[] = [];
      liveBuf.forEach((fr, k) => {
        let m = 0, cnt = 0; const ss: Record<string, number> = {}, sn: Record<string, number> = {};
        stocks.forEach((s) => { const bl = fr.map[s.code]; if (bl) { const r = bl[5]; m += r; cnt++; const t = s.theme ?? "기타"; ss[t] = (ss[t] || 0) + r; sn[t] = (sn[t] || 0) + 1; } });
        const mkt = cnt ? m / cnt : 0; const sm: Record<string, number> = {}; for (const t in ss) sm[t] = ss[t] / sn[t];
        const b: (number | number[])[][] = [];
        for (let i = 0; i < N; i++) {
          const s = stocks[i], th = s.theme ?? "기타", bl = fr.map[s.code];
          if (bl) {
            const secDev = (sm[th] ?? mkt) - mkt, spec = bl[5] - (sm[th] ?? mkt);
            const [led, sp, share] = ledOf(mkt, secDev, spec);
            b[i] = [i, bl[1], bl[2], bl[3], bl[4], bl[5], led, sp, share, bl[6], bl[7], mkt, secDev, bl[8]];
          } else b[i] = [i, 0, 0, 0, 1, 0, 2, 0, 0, 0, -1, mkt, 0, []];
        }
        f[k] = { t: fr.t, b };
      });
      const hi = Math.max(0, liveBuf.length - 1);
      return { f, retEdge: RET_DAILY, lo: 0, hi, yTitle: "등락률 (%) ↑상승 / 하락↓", live: true };
    }
    if (mode === "daily") {
      // 온도계: 빌드의 D² 온도(b[3])·주원인(b[7])을 그대로 사용. 색조는 고유 분해(led)로 보강.
      const f: { t: string; b: (number | number[])[][] }[] = [];
      for (let d = startIdx; d <= endIdx; d++) {
        const b: (number | number[])[][] = [];
        for (let i = 0; i < N; i++) {
          const bl = frames[d].b[i];
          const x = bl[1], y = bl[2], a = bl[3], rel = bl[4], ret = bl[5], d2 = bl[6], grp = bl[7], perc = bl[8];
          const th = themeOf[i];
          const mkt = dMkt[d], secDev = dSec[d][th] - mkt, spec = ret - dSec[d][th];
          const [led, sp, share] = ledOf(mkt, secDev, spec);
          b[i] = [i, x, y, a, rel, ret, led, sp, share, d2, grp, mkt, secDev, perc];
        }
        f[d] = { t: frames[d].t, b };
      }
      return { f, retEdge: RET_DAILY, lo: startIdx, hi: endIdx, yTitle: "등락률 (%) ↑상승 / 하락↓" };
    }
    // 누적: 시작일 종가 대비 복리 누적 + 구간 평균 거래량 배수
    const cumP = new Array(N).fill(1), volS = new Array(N).fill(0);
    let cumMkt = 1; const cumSec: Record<string, number> = {};
    const raw: { cr: number; av: number; mkt: number; secDev: number; spec: number }[][] = [];
    let maxAbs = 0, cnt = 0;
    for (let d = startIdx; d <= endIdx; d++) {
      cnt++;
      if (d > startIdx) cumMkt *= 1 + dMkt[d] / 100;
      for (const t in dSec[d]) { if (!(t in cumSec)) cumSec[t] = 1; else if (d > startIdx) cumSec[t] *= 1 + dSec[d][t] / 100; }
      const mktR = (cumMkt - 1) * 100;
      const row: { cr: number; av: number; mkt: number; secDev: number; spec: number }[] = [];
      for (let i = 0; i < N; i++) {
        if (d > startIdx) cumP[i] *= 1 + frames[d].b[i][5] / 100;
        volS[i] += frames[d].b[i][4];
        const cr = (cumP[i] - 1) * 100, av = volS[i] / cnt;
        const secR = ((cumSec[themeOf[i]] ?? 1) - 1) * 100;
        if (Math.abs(cr) > maxAbs) maxAbs = Math.abs(cr);
        row[i] = { cr, av, mkt: mktR, secDev: secR - mktR, spec: cr - secR };
      }
      raw[d] = row;
    }
    const retEdge = Math.max(8, Math.ceil((maxAbs * 1.05) / 5) * 5);
    const f: { t: string; b: (number | number[])[][] }[] = [];
    for (let d = startIdx; d <= endIdx; d++) {
      const b: (number | number[])[][] = [];
      for (let i = 0; i < N; i++) {
        const { cr, av, mkt, secDev, spec } = raw[d][i];
        const [x, y, a] = calc(av, cr, retEdge);
        const [led, sp, share] = ledOf(mkt, secDev, spec);
        b[i] = [i, x, y, a, av, cr, led, sp, share, 0, -1, mkt, secDev, []]; // 누적: D²·주원인·백분위 없음(방향 분해 기반)
      }
      f[d] = { t: frames[d].t, b };
    }
    return { f, retEdge, lo: startIdx, hi: endIdx, yTitle: "누적 등락률 (%, 시작일 대비) ↑/↓" };
  }, [mode, startIdx, endIdx, frames, stocks, frameCount, liveBuf]);
  const viewRef = useRef(view); useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => { stRef.current.playing = playing; }, [playing]);
  useEffect(() => { selRef.current = selected; }, [selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener("resize", resize);
    let raf = 0;
    const loop = (t: number) => {
      const s = stRef.current, V = viewRef.current;
      const dt = Math.min(60, t - s.last) / 1000; s.last = t;
      s.animF += (s.target - s.animF) * (1 - Math.exp(-dt * 7));
      if (Math.abs(s.target - s.animF) < 0.003) s.animF = s.target;
      const moving = s.animF !== s.target;
      if (s.playing) {
        if (!moving) { s.dwell += dt; if (s.dwell >= 0.6) { if (s.target < V.hi) { s.target += 1; s.dwell = 0; } else { s.playing = false; setPlaying(false); s.dwell = 0; } } }
        const di = Math.round(s.animF); if (di !== s.shown) { s.shown = di; setPlayIdx(di); }
      } else s.dwell = 0;
      if (s.playing || moving) s.sweep += dt * 0.7;

      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 22;
      let i0 = clamp(Math.floor(s.animF), V.lo, V.hi); const i1 = Math.min(i0 + 1, V.hi);
      const fr = clamp(s.animF - i0, 0, 1);
      const f0 = V.f[i0]?.b, f1 = V.f[i1]?.b; const E = V.retEdge;
      if (!f0 || !f1) { raf = requestAnimationFrame(loop); return; }
      const mapX = (x: number) => cx + x * R * 0.92, mapY = (y: number) => cy - y * R * 0.92;
      const sel = selRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(31,214,154,0.11)"; ctx.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * k / 4, 0, 7); ctx.stroke(); }
      ctx.fillStyle = "rgba(31,214,154,0.045)"; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      for (const tk of xTicks) ctx.fillText(tk.l, mapX(Math.log2(tk.m) / VOL_EDGE), cy + 13);
      ctx.textAlign = "left";
      const half = Math.round(E / 2);
      for (const tk of [{ p: E, l: `+${E}%` }, { p: half, l: `+${half}%` }, { p: -half, l: `−${half}%` }, { p: -E, l: `−${E}%` }])
        ctx.fillText(tk.l, cx + 5, mapY(tk.p / E) + 3);
      if (s.playing || moving) {
        const g = ctx.createConicGradient(s.sweep, cx, cy);
        g.addColorStop(0, "rgba(31,214,154,0)"); g.addColorStop(0.9, "rgba(31,214,154,0)");
        g.addColorStop(0.99, "rgba(31,214,154,0.12)"); g.addColorStop(1, "rgba(31,214,154,0.22)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.sweep); ctx.strokeStyle = "rgba(31,214,154,0.4)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,0.34)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("거래량 (평소의 몇 배) →", cx, cy + R + 14);
      ctx.save(); ctx.translate(cx - R - 8, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(V.yTitle, 0, 0); ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(31,214,154,0.45)"; ctx.font = "12px monospace";
      ctx.fillText(`${V.f[Math.round(clamp(s.animF, V.lo, V.hi))]?.t ?? ""}${s.playing ? " ▶" : " ⏸"}`, 12, 19);

      const swA = ((s.sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const orderList = [...stocks.keys()].sort((a, c) => (f0[a][3] as number) - (f0[c][3] as number));
      for (const i of orderList) {
        const a0 = f0[i] as number[], a1 = f1[i] as number[];
        const x = a0[1] + (a1[1] - a0[1]) * fr, y = a0[2] + (a1[2] - a0[2]) * fr;
        const anomaly = a0[3], ret = a0[5], ledBy = a0[6] ?? 0, grp = a0[10] ?? -1;
        const isSel = sel === i, hot = anomaly >= HOT;
        // 색조=왜 떴나: 수익률 주도(grp 1, 누적 -1)→빨강/파랑(고유는 진하게, 시장·섹터 동반은 옅게),
        //              거래량·변동성·자금 주도→호박색(수익률이 아닌 이유로 뜬 것), 평범→회색.
        const retDriven = grp === 1 || grp === -1;
        const px = mapX(x), py = mapY(y); posRef.current[i] = { x: px, y: py };
        const up = y >= 0;
        const col = isSel ? SELECT : !hot ? NEUTRAL
          : retDriven ? (ledBy === 0 ? (up ? UP : DOWN) : (up ? MUTED_UP : MUTED_DOWN)) : AMBER;
        const dim = sel != null && !isSel && !hot ? 0.4 : 1;
        let ang = Math.atan2(-y, x); ang = (ang + 2 * Math.PI) % (2 * Math.PI);
        let d = swA - ang; d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const lit = (s.playing || moving) && d < 0.5 ? 1 - d / 0.5 : 0;
        const r = isSel ? 4 + anomaly * 4 : 2.3 + anomaly * 5;
        // 발광: 뜨거울수록(온도 D²) 크고 밝게 — 원인 색과 무관하게 강도 표현
        if (isSel || hot) { ctx.globalAlpha = 0.15 * Math.max(anomaly, lit, isSel ? 0.6 : 0) * dim; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r + 7 * Math.max(anomaly, lit, isSel ? 0.7 : 0), 0, 7); ctx.fill(); }
        ctx.globalAlpha = (hot || isSel ? 0.6 + 0.4 * Math.max(anomaly, lit) : 0.4 + 0.2 * lit) * dim;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        if (isSel) { ctx.globalAlpha = s.playing ? 0.6 + 0.4 * Math.abs(Math.sin(t / 350)) : 0.9; ctx.strokeStyle = SELECT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, r + 5, 0, 7); ctx.stroke(); }
        else if (hot) { ctx.globalAlpha = 0.5 * Math.max(anomaly, lit) * dim; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 7); ctx.stroke(); }
        if (isSel) {
          const why = grp >= 0 ? GROUP_LABELS[grp] : "수익률";
          ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(34,197,94,0.5)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px + r, py - r); ctx.lineTo(px + r + 7, py - r - 7); ctx.lineTo(px + r + 92, py - r - 7); ctx.stroke();
          ctx.fillStyle = col; ctx.font = "11px monospace"; ctx.textAlign = "left";
          ctx.fillText(`${stocks[i].name} ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}% · ${why}`, px + r + 9, py - r - 10);
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [frames, frameCount, stocks]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = -1, bd = 16 * 16;
    posRef.current.forEach((p, i) => { const dd = (p.x - mx) ** 2 + (p.y - my) ** 2; if (dd < bd) { bd = dd; best = i; } });
    setSelected((cur) => (best === -1 ? null : best === cur ? null : best));
  };

  const lists = useMemo(() => {
    const b = view.f[playIdx]?.b ?? [];
    const rows = b.map((x) => { const r = x as number[]; return { idx: r[0], name: stocks[r[0]].name, temp: r[3], relVol: r[4], retPct: r[5], grp: (r[10] ?? -1) }; });
    return {
      hot: [...rows].filter((r) => r.temp > 0.05).sort((a, c) => c.temp - a.temp).slice(0, 5),
      up: [...rows].filter((r) => r.retPct > 0).sort((a, c) => c.retPct - a.retPct).slice(0, 5),
      down: [...rows].filter((r) => r.retPct < 0).sort((a, c) => a.retPct - c.retPct).slice(0, 5),
    };
  }, [view, playIdx, stocks]);

  const dateOpts = frames.map((f, i) => <option key={i} value={i}>{f.t}</option>);
  const goTo = (v: number) => { const s = stRef.current; s.playing = false; s.target = v; s.shown = v; setPlaying(false); setPlayIdx(v); followRef.current = v >= view.hi; };
  const onStart = (v: number) => { setStartIdx(v); if (v > endIdx) setEndIdx(v); goTo(Math.max(v, playIdx)); };
  const onEnd = (v: number) => { setEndIdx(v); if (v < startIdx) setStartIdx(v); goTo(Math.min(v, playIdx)); };
  const togglePlay = () => {
    const s = stRef.current; const lo = view.lo, hi = view.hi;
    if (!playing) { if (s.target >= hi) { s.animF = lo; s.target = lo; s.shown = lo; setPlayIdx(lo); } s.dwell = 0; s.playing = true; setPlaying(true); }
    else { s.playing = false; setPlaying(false); }
  };
  const switchMode = (m: "cum" | "daily" | "live") => {
    setMode(m);
    if (m === "live") { followRef.current = true; const s = stRef.current; s.playing = false; setPlaying(false); s.target = 0; s.animF = 0; s.shown = 0; setPlayIdx(0); }
    else goTo(m === "cum" ? startIdx : endIdx);
  };

  const List = ({ title, accent, rows, kind }: { title: string; accent: string; rows: typeof lists.up; kind: "hot" | "up" | "down" }) => (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="mb-1 px-1 text-[13px] font-bold" style={{ color: accent }}>{title}</div>
      <ul className="space-y-0.5">
        {rows.map((r, k) => {
          const on = selected === r.idx;
          return (
            <li key={r.idx}>
              <button onClick={() => setSelected((c) => (c === r.idx ? null : r.idx))}
                className={`flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors ${on ? "bg-[#22c55e]/10" : "hover:bg-white/[0.04]"}`}>
                <span className="w-3 text-center text-[12px] font-bold tabular-nums text-white/30">{k + 1}</span>
                <CircleLogo name={r.name} on={on} size={7} />
                <span className={`min-w-0 flex-1 truncate text-[13px] ${on ? "text-[#22c55e]" : "text-white/90"}`}>{r.name}</span>
                {kind === "hot" && r.grp >= 0 && (
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-white/50">{GROUP_LABELS[r.grp]}</span>
                )}
                <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: kind === "hot" ? AMBER : kind === "up" ? UP : DOWN }}>
                  {kind === "hot" ? `${Math.round(r.temp * 100)}°` : `${r.retPct >= 0 ? "+" : ""}${r.retPct.toFixed(1)}%`}
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-1 py-2 text-xs text-white/30">없음</li>}
      </ul>
    </div>
  );
  const TabBtn = ({ m, label }: { m: "cum" | "daily" | "live"; label: string }) => (
    <button onClick={() => switchMode(m)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${mode === m ? "bg-[#3182f6] text-white" : "bg-white/[0.06] text-white/55 hover:text-white"}`}>{label}</button>
  );

  // 판단 근거 카드 — 종목 선택 시. 예측 아님, 사람이 판단할 근거 조립.
  const JudgmentCard = () => {
    if (selected == null) return null;
    const s = stocks[selected]; const row = view.f[playIdx]?.b[selected]; if (!s || !row) return null;
    const temp = row[3] as number, ret = row[5] as number, led = (row[6] ?? 0) as number;
    const spec = (row[7] ?? 0) as number, grp = (row[10] ?? -1) as number;
    const mkt = (row[11] ?? 0) as number, secDev = (row[12] ?? 0) as number;
    const perc = (row[13] ?? []) as number[];
    const am = Math.abs(mkt), as = Math.abs(secDev), ap = Math.abs(spec), tot = am + as + ap || 1e-9;
    const ledTxt = led === 0 ? "종목 고유" : led === 1 ? "섹터 동반" : "시장 동반";
    const ledCol = led === 0 ? SELECT : "#94a3b8";
    const ta = getTa(s.code);
    const Seg = ({ label, v, col }: { label: string; v: number; col: string }) => (
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[11px] text-white/45">{label}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full" style={{ width: `${Math.round(v / tot * 100)}%`, background: col }} />
        </div>
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/60">{Math.round(v / tot * 100)}%</span>
      </div>
    );
    const taLabel = (() => {
      if (!ta) return null;
      const rsiT = ta.rsi >= 70 ? "과매수" : ta.rsi <= 30 ? "과매도" : "중립";
      const macdT = ta.macdCross === 1 ? "골든크로스" : ta.macdCross === -1 ? "데드크로스" : ta.macdHist > 0 ? "상승" : "하락";
      const bbT = ta.bbPctB > 1 ? "상단 이탈" : ta.bbPctB < 0 ? "하단 이탈" : `밴드 내 ${Math.round(ta.bbPctB * 100)}%`;
      const maT = ta.maArr === 1 ? "정배열" : ta.maArr === -1 ? "역배열" : "혼조";
      const adxT = ta.adx >= 25 ? `추세강함(${ta.trend > 0 ? "상승" : "하락"})` : "추세약함";
      return { rsiT, macdT, bbT, maT, adxT };
    })();

    return (
      <div className="rounded-2xl border border-[#22c55e]/25 bg-[#22c55e]/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleLogo name={s.name} on size={8} />
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-white">
                {s.name}
                {s.market && <span className="rounded bg-white/10 px-1 py-px text-[10px] font-medium text-white/55">{s.market === "KOSDAQ" ? "코스닥" : "코스피"}</span>}
              </div>
              <div className="text-[12px] text-white/50">
                온도 <strong style={{ color: AMBER }}>{Math.round(temp * 100)}°</strong>
                {grp >= 0 && <> · {groupLabel(grp)} 주도</>} · <span style={{ color: ret >= 0 ? UP : DOWN }}>{ret >= 0 ? "+" : ""}{ret.toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <button onClick={() => setSelected(null)} className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-white/50 hover:text-white">닫기 ✕</button>
        </div>

        {/* 1. 왜 떴나 */}
        <div className="mb-3">
          <div className="mb-1.5 text-[12px] font-bold text-white/70">왜 떴나 <span className="font-normal text-white/40">· 이 움직임의 출처</span></div>
          <div className="space-y-1">
            <Seg label="시장" v={am} col="#6a73a0" />
            <Seg label="섹터" v={as} col="#a06a73" />
            <Seg label="고유" v={ap} col={SELECT} />
          </div>
          <div className="mt-1.5 text-[12px]" style={{ color: ledCol }}>→ <strong>{ledTxt}</strong> 주도 {led === 0 ? "(시장·섹터 빼도 이 종목만의 움직임)" : "(테마·지수가 같이 움직임 — 종목만의 신호 약함)"}</div>
        </div>

        {/* 2. 무엇이 특이 */}
        {perc.length === 5 ? (
          <div className="mb-3">
            <div className="mb-1.5 text-[12px] font-bold text-white/70">무엇이 특이 <span className="font-normal text-white/40">· 동종 대비 위치(백분위)</span></div>
            <div className="space-y-1">
              {AXIS5.map((label, k) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[11px] text-white/45">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${perc[k]}%`, background: perc[k] >= 80 ? AMBER : "#5b6573" }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums" style={{ color: perc[k] >= 80 ? AMBER : "rgba(255,255,255,0.45)" }}>
                    {perc[k] >= 50 ? `상위${Math.max(1, 100 - perc[k])}%` : `하위${Math.max(1, perc[k])}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3 text-[12px] text-white/35">무엇이 특이 — 일일 모드에서 보입니다.</div>
        )}

        {/* 3. 통념 지표 + 정직 라벨 */}
        {taLabel && (
          <div className="mb-2">
            <div className="mb-1.5 text-[12px] font-bold text-white/70">통념 지표 <span className="font-normal text-white/40">· 최신일 기준</span></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-white/65">
              <div>RSI <strong className="text-white/85">{ta!.rsi}</strong> <span className="text-white/45">{taLabel.rsiT}</span></div>
              <div>MACD <strong className="text-white/85">{taLabel.macdT}</strong></div>
              <div>볼린저 <strong className="text-white/85">{taLabel.bbT}</strong></div>
              <div>이평 <strong className="text-white/85">{taLabel.maT}</strong></div>
              <div>스토캐스틱 <strong className="text-white/85">{ta!.stochK}</strong></div>
              <div>ADX <strong className="text-white/85">{taLabel.adxT}</strong></div>
            </div>
            <div className="mt-1.5 rounded-lg bg-[#f5a623]/[0.08] px-2 py-1 text-[11px] text-[#f5a623]/90">
              ⚠️ 우리 7개월 검증에서 이 지표들의 미래수익 예측력 <strong>0</strong> (특히 과매도≠반등). 친숙한 참고 맥락일 뿐.
            </div>
          </div>
        )}

        <div className="mt-2 border-t border-white/[0.06] pt-2 text-center text-[11px] text-white/40">
          판단은 당신 몫입니다 · <strong className="text-white/55">매매신호·투자자문 아님</strong>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full" style={{ maxWidth: 540 }}>
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#060a08]" style={{ aspectRatio: "1 / 1" }}>
          <canvas ref={cvRef} onClick={onCanvasClick} className="absolute inset-0 h-full w-full cursor-pointer" role="img" aria-label="종목 관제 레이더 — 거래량 배수×등락률, 날짜 범위 스냅샷/누적" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
          <TabBtn m="live" label="실시간" /><TabBtn m="daily" label="일일" /><TabBtn m="cum" label="누적" />
        </div>
        {mode === "live" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f04452]/12 px-3 py-1.5 font-semibold text-[#f04452]">
            <span className={`h-1.5 w-1.5 rounded-full bg-[#f04452] ${liveLast?.open ? "animate-pulse" : ""}`} />
            {liveLast ? (liveLast.open ? `LIVE ${liveLast.t}` : `장 마감 · ${liveLast.t}`) : "연결 중…"}
          </span>
        )}
        <button onClick={togglePlay} disabled={view.hi <= view.lo} className="rounded-full bg-[#3182f6] px-4 py-1.5 font-semibold text-white transition-colors hover:bg-[#2670e8] disabled:opacity-40">{playing ? "⏸ 정지" : "▶ 재생"}</button>
        {mode !== "live" && (
          <>
            <span className="text-white/45">기간</span>
            <select value={startIdx} onChange={(e) => onStart(+e.target.value)} className="rounded-lg border border-white/10 bg-base-700 px-2 py-1 text-white/90">{dateOpts}</select>
            <span className="text-white/35">~</span>
            <select value={endIdx} onChange={(e) => onEnd(+e.target.value)} className="rounded-lg border border-white/10 bg-base-700 px-2 py-1 text-white/90">{dateOpts}</select>
          </>
        )}
      </div>
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <input type="range" min={view.lo} max={Math.max(view.lo, view.hi)} step={1} value={clamp(playIdx, view.lo, view.hi)} onChange={(e) => goTo(+e.target.value)} disabled={view.hi <= view.lo} className="flex-1 disabled:opacity-40" />
        <span className="w-32 shrink-0 text-right text-sm font-bold tabular-nums text-white/80">
          {view.f[clamp(playIdx, view.lo, view.hi)]?.t ?? (mode === "live" ? "수집 중…" : "")} {playing ? "재생중" : mode === "live" ? (followRef.current ? "LIVE" : "과거") : "고정"}
        </span>
      </div>
      {mode === "live" && (
        <p className="text-center text-[11px] text-white/35">
          1분마다 스냅샷이 쌓입니다 · 슬라이더를 뒤로 옮기면 <strong className="text-white/55">장중 이전 시점</strong>, ▶ 재생으로 움직임을 봅니다 · 현재 <strong className="text-white/55">{liveBuf.length}개</strong> 스냅샷
        </p>
      )}

      {selected != null && <JudgmentCard />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <List title="온도 상위 (평소와 다른 정도)" accent={AMBER} rows={lists.hot} kind="hot" />
        <List title={mode === "cum" ? "누적 상승 상위" : "상승률 상위"} accent={UP} rows={lists.up} kind="up" />
        <List title={mode === "cum" ? "누적 하락 상위" : "하락률 상위"} accent={DOWN} rows={lists.down} kind="down" />
      </div>

      <div className="space-y-1 text-center text-[11px] text-white/35">
        <p>
          <strong className="text-white/55">크기·밝기 = 온도</strong>(D², 지금 평소와 얼마나 다른가) — 거래량·고유수익·변동성·자금유입 5축의 동시 이탈 강도.
        </p>
        <p>
          색조 = <strong className="text-white/50">왜 떴나</strong> ·{" "}
          <span style={{ color: UP }}>빨강</span>/<span style={{ color: DOWN }}>파랑</span> = 수익률 주도(<span style={{ color: MUTED_UP }}>옅으면</span> 시장·섹터 동반) ·{" "}
          <span style={{ color: AMBER }}>호박색</span> = 거래량·변동성·자금 주도(수익률 아님) · <span style={{ color: SELECT }}>초록 선택</span>.
        </p>
        <p className="text-white/45"><strong>온도는 &ldquo;크게 움직이는 중&rdquo;을 뜻할 뿐, 방향(오를지/내릴지)·매매신호가 아닙니다. 투자자문 아님.</strong></p>
      </div>
    </div>
  );
}
