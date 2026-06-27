"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { radarData, blipReasons } from "@/lib/radarData";

// 팔레트: 회색=평범, 색=이상, 초록=선택
const NEUTRAL = "#5b6573", UP = "#f04452", DOWN = "#4c82fb", SELECT = "#22c55e";
const HOT = 0.45;
const VOL_EDGE = 3.2, RET_EDGE = 14; // 빌드와 동일: x=log2(배)/3.2, y=등락%/14
const xTicks = [{ m: 1, l: "1배" }, { m: 2, l: "2배" }, { m: 4, l: "4배" }];
const yTicks = [{ p: 14, l: "+14%" }, { p: 7, l: "+7%" }, { p: -7, l: "−7%" }, { p: -14, l: "−14%" }];

const LOGO_BG = ["#3182f6", "#f04452", "#f5a623", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b", "#0ea5e9"];
function CircleLogo({ name, on }: { name: string; on?: boolean }) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const ko = name.replace(/^[A-Z]+\s*/, "").charAt(0);
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
      style={{ background: on ? SELECT : LOGO_BG[h % LOGO_BG.length] }}>{ko || name.charAt(0)}</span>
  );
}

export default function StockRadar() {
  const { stocks, frames, frameCount } = radarData;
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ frameF: frameCount - 1, sweep: -Math.PI / 2, playing: false, speed: 1, last: 0 });
  const dateRef = useRef(frameCount - 1);
  const selRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number }[]>(stocks.map(() => ({ x: 0, y: 0 })));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dateIdx, setDateIdx] = useState(frameCount - 1);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => { stateRef.current.playing = playing; }, [playing]);
  useEffect(() => { stateRef.current.speed = speed; }, [speed]);
  useEffect(() => { selRef.current = selected; }, [selected]);
  useEffect(() => { dateRef.current = dateIdx; if (!stateRef.current.playing) stateRef.current.frameF = dateIdx; }, [dateIdx]);
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
      const s = stateRef.current;
      const dt = Math.min(60, t - s.last) / 1000; s.last = t;
      if (s.playing) {
        s.frameF += dt * 0.45 * s.speed;
        if (s.frameF >= frameCount - 1) { s.frameF = frameCount - 1; s.playing = false; setPlaying(false); }
        const di = Math.round(s.frameF); if (di !== dateRef.current) { dateRef.current = di; setDateIdx(di); }
      } else {
        s.frameF = dateRef.current; // 정지 = 해당 날짜 스냅샷 고정
      }
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
      // 링·정상권
      ctx.strokeStyle = "rgba(31,214,154,0.11)"; ctx.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * k / 4, 0, 7); ctx.stroke(); }
      ctx.fillStyle = "rgba(31,214,154,0.045)"; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      // 눈금(평범한 단위)
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      for (const tk of xTicks) { const px = mapX(Math.log2(tk.m) / VOL_EDGE); ctx.fillText(tk.l, px, cy + 13); }
      ctx.textAlign = "left";
      for (const tk of yTicks) { const py = mapY(tk.p / RET_EDGE); ctx.fillText(tk.l, cx + 5, py + 3); }
      // 스윕
      const g = ctx.createConicGradient(s.sweep, cx, cy);
      g.addColorStop(0, "rgba(31,214,154,0)"); g.addColorStop(0.9, "rgba(31,214,154,0)");
      g.addColorStop(0.99, "rgba(31,214,154,0.12)"); g.addColorStop(1, "rgba(31,214,154,0.22)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.sweep); ctx.strokeStyle = "rgba(31,214,154,0.4)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.restore();
      // 축 제목
      ctx.fillStyle = "rgba(255,255,255,0.34)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("거래량 (평소의 몇 배) →", cx, cy + R + 14);
      ctx.save(); ctx.translate(cx - R - 8, cy); ctx.rotate(-Math.PI / 2); ctx.fillText("등락률 (%) ↑상승 / 하락↓", 0, 0); ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(31,214,154,0.4)"; ctx.font = "11px monospace";
      ctx.fillText(`${frames[dateI].t}${s.playing ? " ▶" : " ⏸"}`, 12, 18);

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
        if (isSel) { // 라벨은 선택 종목만(겹침 방지) — 나머지 이름은 경보 패널·클릭으로
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(34,197,94,0.5)"; ctx.lineWidth = 1;
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

  const alerts = useMemo(() => {
    const b = frames[dateIdx]?.b ?? [];
    return [...b].sort((p, q) => q[3] - p[3]).slice(0, 6).map((x) => ({
      idx: x[0], name: stocks[x[0]].name, anomaly: x[3], relVol: x[4], retPct: x[5], up: x[5] >= 0,
    }));
  }, [dateIdx, frames, stocks]);

  const Legend = ({ c, label }: { c: string; label: string }) => (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/45"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{label}</span>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="lg:flex-[3]">
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#060a08]" style={{ aspectRatio: "1 / 1", maxHeight: 520 }}>
          <canvas ref={cvRef} onClick={onCanvasClick} className="absolute inset-0 h-full w-full cursor-pointer" role="img" aria-label="종목 관제 레이더 — 거래량 배수×등락률 평면, 날짜별 스냅샷" />
        </div>
        {/* 날짜 슬라이더 = 메인 컨트롤 */}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => setPlaying((p) => !p)} className="shrink-0 rounded-full bg-[#3182f6] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#2670e8]">
            {playing ? "⏸ 정지" : "▶ 재생"}
          </button>
          <div className="flex-1">
            <input type="range" min={0} max={frameCount - 1} step={1} value={dateIdx}
              onChange={(e) => { setPlaying(false); setDateIdx(+e.target.value); }} className="w-full" />
            <div className="mt-0.5 flex justify-between text-[11px] text-white/35">
              <span>{frames[0]?.t}</span>
              <span className="font-bold text-white/70">{frames[dateIdx]?.t} {playing ? "재생중" : "(고정)"}</span>
              <span>{frames[frameCount - 1]?.t}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Legend c={NEUTRAL} label="평범" /><Legend c={UP} label="이상 급등" /><Legend c={DOWN} label="이상 급락" /><Legend c={SELECT} label="선택" />
          {selected != null && <button onClick={() => setSelected(null)} className="rounded-full bg-[#22c55e]/15 px-2.5 py-0.5 text-xs text-[#22c55e]">● {stocks[selected].name} ✕</button>}
        </div>
      </div>

      <div className="lg:flex-[2]">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5">
          <div className="mb-1 flex items-center justify-between px-1.5 py-1">
            <div className="flex items-center gap-2 text-[15px] font-bold text-white"><span className="h-1.5 w-1.5 rounded-full bg-[#f04452]" /> 이상 경보</div>
            <span className="text-xs tabular-nums text-white/40">{frames[dateIdx]?.t}</span>
          </div>
          <ul>
            {alerts.map((a, k) => {
              const on = selected === a.idx;
              return (
                <li key={a.name + k}>
                  <button onClick={() => setSelected((cur) => (cur === a.idx ? null : a.idx))}
                    className={`flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition-colors ${on ? "bg-[#22c55e]/10" : "hover:bg-white/[0.04]"}`}>
                    <span className="w-4 text-center text-[13px] font-bold tabular-nums text-white/30">{k + 1}</span>
                    <CircleLogo name={a.name} on={on} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[15px] font-medium ${on ? "text-[#22c55e]" : "text-white"}`}>{a.name}</div>
                      <div className="truncate text-xs text-white/40">{blipReasons(a.relVol, a.retPct).join(" · ")}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[15px] font-bold tabular-nums ${a.up ? "text-[#f04452]" : "text-[#4c82fb]"}`}>{a.up ? "+" : ""}{a.retPct.toFixed(1)}%</div>
                      <div className="mt-0.5 text-[11px] tabular-nums text-white/40">거래량 {a.relVol.toFixed(1)}배</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 px-1.5 text-[11px] leading-relaxed text-white/35">
            가로=거래량(평소의 몇 배), 세로=등락률(%). 중심=평소·보합. <strong className="text-white/50">이상 ≠ 매매신호.</strong>
            날짜를 옮기면 그날 위치로 고정됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
