"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { radarData } from "@/lib/radarData";

const NEUTRAL = "#5b6573", UP = "#f04452", DOWN = "#4c82fb", SELECT = "#22c55e", AMBER = "#f5a623";
const HOT = 0.45;
const VOL_EDGE = 3.2, RET_EDGE = 14;
const xTicks = [{ m: 1, l: "1배" }, { m: 2, l: "2배" }, { m: 4, l: "4배" }];
const yTicks = [{ p: 14, l: "+14%" }, { p: 7, l: "+7%" }, { p: -7, l: "−7%" }, { p: -14, l: "−14%" }];

const LOGO_BG = ["#3182f6", "#f04452", "#f5a623", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b", "#0ea5e9"];
function CircleLogo({ name, on, size = 8 }: { name: string; on?: boolean; size?: number }) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const ko = name.replace(/^[A-Z]+\s*/, "").charAt(0);
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ width: size * 4, height: size * 4, fontSize: 12, background: on ? SELECT : LOGO_BG[h % LOGO_BG.length] }}>
      {ko || name.charAt(0)}
    </span>
  );
}

export default function StockRadar() {
  const { stocks, frames, frameCount } = radarData;
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef({ frameF: frameCount - 1, sweep: -Math.PI / 2, playing: false, last: 0, start: 0, end: frameCount - 1, play: frameCount - 1 });
  const selRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number }[]>(stocks.map(() => ({ x: 0, y: 0 })));
  const [startIdx, setStartIdx] = useState(Math.max(0, frameCount - 5));
  const [endIdx, setEndIdx] = useState(frameCount - 1);
  const [playIdx, setPlayIdx] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => { stRef.current.playing = playing; }, [playing]);
  useEffect(() => { selRef.current = selected; }, [selected]);
  useEffect(() => { stRef.current.start = startIdx; }, [startIdx]);
  useEffect(() => { stRef.current.end = endIdx; }, [endIdx]);
  useEffect(() => { stRef.current.play = playIdx; if (!stRef.current.playing) stRef.current.frameF = playIdx; }, [playIdx]);
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
      const s = stRef.current;
      const dt = Math.min(60, t - s.last) / 1000; s.last = t;
      if (s.playing) {
        s.frameF += dt * 0.6;
        if (s.frameF >= s.end) { s.frameF = s.end; s.playing = false; setPlaying(false); }
        const di = Math.round(s.frameF); if (di !== s.play) { s.play = di; setPlayIdx(di); }
      } else s.frameF = s.play;
      s.sweep += dt * 0.7;

      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 22;
      const i0 = Math.floor(s.frameF) % frameCount, i1 = Math.min(i0 + 1, frameCount - 1);
      const frRaw = s.frameF - Math.floor(s.frameF);
      const fr = frRaw < 0.5 ? 2 * frRaw * frRaw : 1 - Math.pow(-2 * frRaw + 2, 2) / 2;
      const dateI = Math.round(s.frameF) % frameCount;
      const f0 = frames[i0].b, f1 = frames[i1].b;
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
      for (const tk of yTicks) ctx.fillText(tk.l, cx + 5, mapY(tk.p / RET_EDGE) + 3);
      const g = ctx.createConicGradient(s.sweep, cx, cy);
      g.addColorStop(0, "rgba(31,214,154,0)"); g.addColorStop(0.9, "rgba(31,214,154,0)");
      g.addColorStop(0.99, "rgba(31,214,154,0.12)"); g.addColorStop(1, "rgba(31,214,154,0.22)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.sweep); ctx.strokeStyle = "rgba(31,214,154,0.4)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.34)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("거래량 (평소의 몇 배) →", cx, cy + R + 14);
      ctx.save(); ctx.translate(cx - R - 8, cy); ctx.rotate(-Math.PI / 2); ctx.fillText("등락률 (%) ↑상승 / 하락↓", 0, 0); ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(31,214,154,0.45)"; ctx.font = "12px monospace";
      ctx.fillText(`${frames[dateI].t}${s.playing ? " ▶" : " ⏸"}`, 12, 19);

      const swA = ((s.sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const order = [...stocks.keys()].sort((a, c) => f0[a][3] - f0[c][3]);
      for (const i of order) {
        const a0 = f0[i], a1 = f1[i];
        const x = a0[1] + (a1[1] - a0[1]) * fr, y = a0[2] + (a1[2] - a0[2]) * fr;
        const anomaly = a0[3], ret = a0[5];
        const isSel = sel === i, hot = anomaly >= HOT;
        const px = mapX(x), py = mapY(y); posRef.current[i] = { x: px, y: py };
        const col = isSel ? SELECT : hot ? (y >= 0 ? UP : DOWN) : NEUTRAL;
        const dim = sel != null && !isSel && !hot ? 0.4 : 1;
        let ang = Math.atan2(-y, x); ang = (ang + 2 * Math.PI) % (2 * Math.PI);
        let d = swA - ang; d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const lit = d < 0.5 ? 1 - d / 0.5 : 0;
        const r = isSel ? 4 + anomaly * 4 : 2.3 + anomaly * 5;
        if (isSel || hot) { ctx.globalAlpha = 0.15 * Math.max(anomaly, lit, isSel ? 0.6 : 0) * dim; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r + 7 * Math.max(anomaly, lit, isSel ? 0.7 : 0), 0, 7); ctx.fill(); }
        ctx.globalAlpha = (hot || isSel ? 0.6 + 0.4 * Math.max(anomaly, lit) : 0.4 + 0.2 * lit) * dim;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        if (isSel) { ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(t / 350)); ctx.strokeStyle = SELECT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, r + 5, 0, 7); ctx.stroke(); }
        else if (hot) { ctx.globalAlpha = 0.5 * Math.max(anomaly, lit) * dim; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 7); ctx.stroke(); }
        if (isSel) {
          ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(34,197,94,0.5)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px + r, py - r); ctx.lineTo(px + r + 7, py - r - 7); ctx.lineTo(px + r + 44, py - r - 7); ctx.stroke();
          ctx.fillStyle = col; ctx.font = "11px monospace"; ctx.textAlign = "left";
          ctx.fillText(`${stocks[i].name} ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`, px + r + 9, py - r - 10);
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

  // 현재 날짜의 상승/하락/거래량 상위 5
  const lists = useMemo(() => {
    const b = frames[playIdx]?.b ?? [];
    const rows = b.map((x) => ({ idx: x[0], name: stocks[x[0]].name, relVol: x[4], retPct: x[5] }));
    return {
      up: [...rows].filter((r) => r.retPct > 0).sort((a, c) => c.retPct - a.retPct).slice(0, 5),
      down: [...rows].filter((r) => r.retPct < 0).sort((a, c) => a.retPct - c.retPct).slice(0, 5),
      vol: [...rows].sort((a, c) => c.relVol - a.relVol).slice(0, 5),
    };
  }, [playIdx, frames, stocks]);

  const dateOpts = frames.map((f, i) => <option key={i} value={i}>{f.t}</option>);
  const onStart = (v: number) => { setPlaying(false); setStartIdx(v); if (v > endIdx) setEndIdx(v); if (playIdx < v) setPlayIdx(v); };
  const onEnd = (v: number) => { setPlaying(false); setEndIdx(v); if (v < startIdx) setStartIdx(v); if (playIdx > v) setPlayIdx(v); };
  const togglePlay = () => { if (!playing && playIdx >= endIdx) { setPlayIdx(startIdx); stRef.current.frameF = startIdx; } setPlaying((p) => !p); };

  const List = ({ title, accent, rows, kind }: { title: string; accent: string; rows: typeof lists.up; kind: "up" | "down" | "vol" }) => (
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
                <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: kind === "vol" ? "#e8ebf0" : kind === "up" ? UP : DOWN }}>
                  {kind === "vol" ? `${r.relVol.toFixed(1)}배` : `${r.retPct >= 0 ? "+" : ""}${r.retPct.toFixed(1)}%`}
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-1 py-2 text-xs text-white/30">없음</li>}
      </ul>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full" style={{ maxWidth: 540 }}>
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#060a08]" style={{ aspectRatio: "1 / 1" }}>
          <canvas ref={cvRef} onClick={onCanvasClick} className="absolute inset-0 h-full w-full cursor-pointer" role="img" aria-label="종목 관제 레이더 — 거래량 배수×등락률(종가 기준), 날짜 범위 스냅샷" />
        </div>
      </div>

      {/* 날짜 범위 + 재생 */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <button onClick={togglePlay} className="rounded-full bg-[#3182f6] px-4 py-1.5 font-semibold text-white transition-colors hover:bg-[#2670e8]">
          {playing ? "⏸ 정지" : "▶ 재생"}
        </button>
        <span className="text-white/45">기간</span>
        <select value={startIdx} onChange={(e) => onStart(+e.target.value)} className="rounded-lg border border-white/10 bg-base-700 px-2 py-1 text-white/90">{dateOpts}</select>
        <span className="text-white/35">~</span>
        <select value={endIdx} onChange={(e) => onEnd(+e.target.value)} className="rounded-lg border border-white/10 bg-base-700 px-2 py-1 text-white/90">{dateOpts}</select>
      </div>
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <input type="range" min={startIdx} max={endIdx} step={1} value={playIdx}
          onChange={(e) => { setPlaying(false); setPlayIdx(+e.target.value); }} className="flex-1" />
        <span className="w-28 shrink-0 text-right text-sm font-bold tabular-nums text-white/80">{frames[playIdx]?.t} {playing ? "재생중" : "고정"}</span>
      </div>

      {/* 상승/하락/거래량 상위 5 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <List title="상승률 상위" accent={UP} rows={lists.up} kind="up" />
        <List title="하락률 상위" accent={DOWN} rows={lists.down} kind="down" />
        <List title="거래량 상위 (평소 대비)" accent={AMBER} rows={lists.vol} kind="vol" />
      </div>

      <p className="text-center text-[11px] text-white/35">
        회색=평범 · <span style={{ color: UP }}>빨강=이상 급등</span> · <span style={{ color: DOWN }}>파랑=이상 급락</span> ·
        <span style={{ color: SELECT }}> 초록=선택</span> · 점 클릭/리스트로 선택. <strong className="text-white/50">이상 ≠ 매매신호.</strong>
      </p>
    </div>
  );
}
