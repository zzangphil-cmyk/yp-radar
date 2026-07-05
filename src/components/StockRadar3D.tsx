"use client";

// 3D 관제 구체 — 4축: X 거래량 · Y 수익률 · Z 자금유입(공간) + 온도 D²(크기·발광)
//   모드: 실시간(공유 훅 useLiveDay — 2D와 동일 파이프라인) · 일일 · 누적. 원점 = 그날 횡단면 평균.
//   드래그 회전 · 휠/핀치 줌 · 성좌(테마 연결선) · ✦대장주 · 성도 라벨. 의존성 없는 캔버스 3D.
import { useEffect, useMemo, useRef, useState } from "react";
import { radarData, groupLabel } from "@/lib/radarData";
import { themeMeta, ThemePanel, JudgeCard, judgePropsFromFrame, useLiveDay, dayKST, fmtDay, SELECT, AMBER } from "./radarShared";

const HOT = 0.4, F_PERS = 3.4, DZ = 0.5;
const ZOOM_MIN = 0.6, ZOOM_MAX = 5, LABEL_ZOOM = 1.7; // 성도(星圖)처럼: 줌인하면 고온 별 이름 표시
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 배경 별밭(고정 시드 — 시차 패럴랙스용)
const STARS = Array.from({ length: 130 }, (_, i) => {
  const h = (i * 2654435761) >>> 0;
  const f = (k: number) => ((h >> k) & 1023) / 1023;
  return { x: f(0), y: f(10), r: f(20) < 0.85 ? 1 : 1.6, a: 0.05 + 0.1 * f(3), p: 0.3 + 0.7 * f(13) };
});

type Row = [number, number, number, number, number, number]; // [x, y, z(자금유입), temp, ret, grp]
type View = { f: Row[][]; labels: string[]; lo: number; hi: number; live?: boolean; overrideB?: ((number[] | null)[])[] };

export default function StockRadar3D() {
  const { stocks, frames, frameCount } = radarData;
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef({ animF: frameCount - 1, target: frameCount - 1, yaw: -0.6, pitch: 0.35, zoom: 1, dragging: false, lastX: 0, lastY: 0, moved: 0, last: 0, dwell: 0, playing: false });
  const ptrRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef(0);
  const renderRef = useRef<(() => void) | null>(null);
  const posRef = useRef<{ x: number; y: number; d: number }[]>(stocks.map(() => ({ x: 0, y: 0, d: 0 })));
  const selRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"live" | "daily" | "cum">("daily");
  const [startIdx, setStartIdx] = useState(Math.max(0, frameCount - 5));
  const [endIdx, setEndIdx] = useState(frameCount - 1);
  const [playIdx, setPlayIdx] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [constell, setConstell] = useState(true);
  const constellRef = useRef(true);
  useEffect(() => { constellRef.current = constell; renderRef.current?.(); }, [constell]);
  useEffect(() => { selRef.current = selected; renderRef.current?.(); }, [selected]);
  useEffect(() => { stRef.current.playing = playing; }, [playing]);

  // 실시간 — 2D와 동일한 공유 훅(히스토리 시딩·폴링·IDB·기록일)
  const { liveBuf, liveDate, days, isToday, liveClosed, liveLast, loadSeq, pickDate: pickDateRaw, goToday } = useLiveDay(mode === "live");
  const followRef = useRef(true);
  useEffect(() => { followRef.current = true; const st = stRef.current; st.target = 0; st.animF = 0; }, [loadSeq]);
  useEffect(() => {
    if (mode === "live" && isToday && followRef.current && !stRef.current.playing && liveBuf.length) {
      const hi = liveBuf.length - 1; stRef.current.target = hi; setPlayIdx(hi);
    }
  }, [liveBuf.length, mode, isToday]);

  // 모드별 뷰: 프레임 행 [x, y, z, temp, ret, grp] — blip: [i,x,y,temp,rel,ret,d2,grp,pct5,zFlow]
  const view = useMemo<View>(() => {
    const N = stocks.length;
    if (mode === "live") {
      const f: Row[][] = [], labels: string[] = [], overrideB: ((number[] | null)[])[] = [];
      liveBuf.forEach((fr, k) => {
        const rows: Row[] = []; const ob: (number[] | null)[] = [];
        for (let i = 0; i < N; i++) {
          const bl = fr.map[stocks[i].code];
          ob[i] = bl ?? null;
          rows[i] = bl ? [bl[1], bl[2], (bl[9] as number) ?? 0, bl[3], bl[5], (bl[7] as number) ?? -1] : [0, 0, 0, 0, 0, -1];
        }
        f[k] = rows; labels[k] = fr.t; overrideB[k] = ob;
      });
      return { f, labels, lo: 0, hi: Math.max(0, liveBuf.length - 1), live: true, overrideB };
    }
    if (mode === "daily") {
      const f: Row[][] = [], labels: string[] = [];
      for (let d = startIdx; d <= endIdx; d++) {
        f[d] = frames[d].b.map((bl) => { const b = bl as unknown as number[]; return [b[1], b[2], (b[9] as number) ?? 0, b[3], b[5], (b[7] as number) ?? -1] as Row; });
        labels[d] = frames[d].t;
      }
      return { f, labels, lo: startIdx, hi: endIdx };
    }
    // 누적: 복리 수익 + 평균 거래량 + 평균 자금유입(z) — 원점 = 구간 횡단면 평균
    const cumP = new Array(N).fill(1), volS = new Array(N).fill(0), zS = new Array(N).fill(0);
    const f: Row[][] = [], labels: string[] = [];
    let maxAbs = 0, cnt = 0;
    const raw: { cr: number; av: number; zAvg: number }[][] = [];
    for (let d = startIdx; d <= endIdx; d++) {
      cnt++;
      const row: { cr: number; av: number; zAvg: number }[] = [];
      for (let i = 0; i < N; i++) {
        const b = frames[d].b[i] as unknown as number[];
        if (d > startIdx) cumP[i] *= 1 + b[5] / 100;
        volS[i] += b[4]; zS[i] += (b[9] as number) ?? 0;
        const cr = (cumP[i] - 1) * 100;
        if (Math.abs(cr) > maxAbs) maxAbs = Math.abs(cr);
        row[i] = { cr, av: volS[i] / cnt, zAvg: zS[i] / cnt };
      }
      raw[d] = row;
    }
    const retEdge = Math.max(8, Math.ceil((maxAbs * 1.05) / 5) * 5);
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    for (let d = startIdx; d <= endIdx; d++) {
      const Lmed = med(raw[d].map((r) => Math.log2(Math.max(r.av, 1e-6)))), Rmed = med(raw[d].map((r) => r.cr));
      f[d] = raw[d].map((r) => {
        const x = clamp((Math.log2(Math.max(r.av, 1e-6)) - Lmed) / 3.2, -1, 1);
        const y = clamp((r.cr - Rmed) / retEdge, -1, 1);
        const temp = clamp((Math.hypot(x, y) - DZ) / (1 - DZ), 0, 1);
        return [x, y, clamp(r.zAvg, -1, 1), temp, r.cr, -1] as Row;
      });
      labels[d] = frames[d].t;
    }
    return { f, labels, lo: startIdx, hi: endIdx };
  }, [mode, startIdx, endIdx, frames, stocks, liveBuf]);
  const viewRef = useRef(view); useEffect(() => { viewRef.current = view; renderRef.current?.(); }, [view]);

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener("resize", resize);
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const s = stRef.current; s.zoom = clamp(s.zoom * Math.exp(-e.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX); renderRef.current?.(); };
    cv.addEventListener("wheel", onWheel, { passive: false });

    const proj = (x: number, y: number, z: number, cx: number, cy: number, R: number, cyaw: number, syaw: number, cpit: number, spit: number) => {
      const x1 = x * cyaw + z * syaw, z1 = -x * syaw + z * cyaw;
      const y2 = y * cpit - z1 * spit, z2 = y * spit + z1 * cpit;
      const s = F_PERS / (F_PERS - z2);
      return { px: cx + x1 * R * s, py: cy - y2 * R * s, s, depth: z2 };
    };

    let raf = 0;
    const render = (t: number) => {
      if (!W || !H) resize();
      if (!W || !H) return;
      const s = stRef.current, V = viewRef.current;
      const dt = Math.min(60, t - s.last) / 1000; s.last = t;
      s.animF += (s.target - s.animF) * (1 - Math.exp(-dt * 7));
      if (Math.abs(s.target - s.animF) < 0.003) s.animF = s.target;
      if (s.playing && s.animF === s.target) {
        s.dwell += dt;
        if (s.dwell >= 0.7) { s.dwell = 0; if (s.target < V.hi) { s.target += 1; setPlayIdx(Math.round(s.target)); } else { s.playing = false; setPlaying(false); if (V.live) followRef.current = true; } }
      }
      if (!s.dragging) s.yaw += dt * 0.12;

      const cx = W / 2, cy = H / 2, R = (Math.min(W, H) / 2 - 30) * s.zoom;
      const cyaw = Math.cos(s.yaw), syaw = Math.sin(s.yaw), cpit = Math.cos(s.pitch), spit = Math.sin(s.pitch);
      const P = (x: number, y: number, z: number) => proj(x, y, z, cx, cy, R, cyaw, syaw, cpit, spit);

      ctx.clearRect(0, 0, W, H);
      for (const st of STARS) {
        const px = ((((st.x + s.yaw * 0.04 * st.p) % 1) + 1) % 1) * W;
        const py = ((((st.y + s.pitch * 0.08 * st.p) % 1) + 1) % 1) * H;
        ctx.globalAlpha = st.a; ctx.fillStyle = "#cdd7e3"; ctx.fillRect(px, py, st.r, st.r);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(31,214,154,0.14)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      const ring = (fx: (a: number) => [number, number, number], style: string) => {
        ctx.strokeStyle = style; ctx.beginPath();
        for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2; const [x, y, z] = fx(a); const p = P(x, y, z); if (k === 0) ctx.moveTo(p.px, p.py); else ctx.lineTo(p.px, p.py); }
        ctx.stroke();
      };
      ring((a) => [Math.cos(a), 0, Math.sin(a)], "rgba(31,214,154,0.16)");
      ring((a) => [Math.cos(a) * 0.72, 0.66, Math.sin(a) * 0.72], "rgba(31,214,154,0.08)");
      ring((a) => [Math.cos(a) * 0.72, -0.66, Math.sin(a) * 0.72], "rgba(31,214,154,0.08)");
      ring((a) => [Math.cos(a), Math.sin(a), 0], "rgba(255,255,255,0.05)");
      ring((a) => [0, Math.sin(a), Math.cos(a)], "rgba(255,255,255,0.05)");

      const axis = (x: number, y: number, z: number, col: string, lab: string, lab2?: string) => {
        const a = P(-x, -y, -z), b = P(x, y, z);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke(); ctx.setLineDash([]);
        const e = P(x * 1.16, y * 1.16, z * 1.16);
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(lab, e.px, e.py);
        if (lab2) { const e2 = P(-x * 1.16, -y * 1.16, -z * 1.16); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillText(lab2, e2.px, e2.py); }
      };
      axis(1, 0, 0, "rgba(255,255,255,0.10)", "거래량 ↑", "거래량 ↓");
      axis(0, 1, 0, "rgba(255,255,255,0.10)", mode === "cum" ? "누적수익 +" : "수익률 +", mode === "cum" ? "누적수익 −" : "수익률 −");
      axis(0, 0, 1, "rgba(245,166,35,0.22)", "자금유입 +", "자금유출 −");

      const o = P(0, 0, 0);
      ctx.fillStyle = "rgba(31,214,154,0.5)"; ctx.beginPath(); ctx.arc(o.px, o.py, 2, 0, 7); ctx.fill();

      const i0 = clamp(Math.floor(s.animF), V.lo, V.hi), i1 = Math.min(i0 + 1, V.hi);
      const fr = clamp(s.animF - i0, 0, 1);
      const f0 = V.f[i0], f1 = V.f[i1];
      if (f0 && f1) {
        const TM = themeMeta;
        const pts = stocks.map((_, i) => {
          const x = f0[i][0] + (f1[i][0] - f0[i][0]) * fr, y = f0[i][1] + (f1[i][1] - f0[i][1]) * fr, z = f0[i][2] + (f1[i][2] - f0[i][2]) * fr;
          const p = P(x, y, z);
          posRef.current[i] = { x: p.px, y: p.py, d: p.depth };
          return { i, x, y, z, p, temp: f0[i][3], ret: f0[i][4], grp: f0[i][5] };
        });
        if (constellRef.current) {
          const seen = new Set<number>();
          for (let k = 0; k < TM.members.length; k++) {
            const mem = TM.members[k];
            if (mem.length < 2) continue;
            ctx.strokeStyle = `hsl(${TM.hue[k]} 70% 62%)`; ctx.lineWidth = 1;
            for (const i of mem) {
              const a = pts[i];
              let bj = -1, bd2 = Infinity;
              for (const j of mem) { if (j === i) continue; const b = pts[j]; const dd = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (dd < bd2) { bd2 = dd; bj = j; } }
              if (bj === -1) continue;
              const key = i < bj ? i * 1000 + bj : bj * 1000 + i;
              if (seen.has(key)) continue; seen.add(key);
              const b = pts[bj];
              const fogA = clamp(((a.p.depth + b.p.depth) / 2 + 1.1) / 2.2, 0, 1);
              ctx.globalAlpha = 0.05 + 0.11 * fogA;
              ctx.beginPath(); ctx.moveTo(a.p.px, a.p.py); ctx.lineTo(b.p.px, b.p.py); ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        }
        const sel = selRef.current;
        const order = [...pts].sort((a, b) => a.p.depth - b.p.depth);
        for (const { i, p, temp, ret, grp } of order) {
          const isSel = sel === i, hot = temp >= HOT;
          const k = TM.themeIdx[i], isLeader = TM.leader[k] === i;
          const col = isSel ? SELECT : `hsl(${TM.hue[k]} ${hot ? 88 : 62}% ${hot ? 68 : 56}%)`;
          const fog = clamp((p.depth + 1.1) / 2.2, 0, 1);
          const r = (isSel ? 3.5 : isLeader ? 2.8 : 2) * p.s + temp * 6 * p.s;
          const glowK = Math.max(temp, isLeader ? 0.3 : 0);
          if (hot || isSel || isLeader) { ctx.globalAlpha = (0.10 + 0.16 * glowK) * (0.4 + 0.6 * fog); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.px, p.py, r + 6 * (glowK + (isSel ? 0.4 : 0)), 0, 7); ctx.fill(); }
          ctx.globalAlpha = (hot || isSel ? 0.6 + 0.4 * temp : isLeader ? 0.8 : 0.42) * (0.35 + 0.65 * fog);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.px, p.py, r, 0, 7); ctx.fill();
          if (isLeader && !isSel) {
            ctx.globalAlpha = 0.8 * (0.4 + 0.6 * fog); ctx.strokeStyle = col; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.px - r - 6, p.py); ctx.lineTo(p.px - r - 1.5, p.py); ctx.moveTo(p.px + r + 1.5, p.py); ctx.lineTo(p.px + r + 6, p.py);
            ctx.moveTo(p.px, p.py - r - 6); ctx.lineTo(p.px, p.py - r - 1.5); ctx.moveTo(p.px, p.py + r + 1.5); ctx.lineTo(p.px, p.py + r + 6);
            ctx.stroke();
            ctx.globalAlpha = 0.55 * (0.4 + 0.6 * fog); ctx.fillStyle = col; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
            ctx.fillText(stocks[i].name, p.px + r + 8, p.py + 3);
          }
          if (isSel) {
            ctx.globalAlpha = 0.95; ctx.strokeStyle = SELECT; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(p.px, p.py, r + 5, 0, 7); ctx.stroke();
            ctx.fillStyle = SELECT; ctx.font = "11px monospace"; ctx.textAlign = "left";
            ctx.fillText(`${stocks[i].name} ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}% · ${grp >= 0 ? groupLabel(grp) : mode === "cum" ? "누적" : ""}`, p.px + r + 8, p.py - r - 6);
          } else if (hot && !isLeader && s.zoom >= LABEL_ZOOM) {
            ctx.globalAlpha = clamp((s.zoom - LABEL_ZOOM) / 0.6, 0, 0.85) * (0.4 + 0.6 * fog);
            ctx.fillStyle = col; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
            ctx.fillText(stocks[i].name, p.px + r + 5, p.py + 3);
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.fillStyle = "rgba(31,214,154,0.5)"; ctx.font = "12px monospace"; ctx.textAlign = "left";
      ctx.fillText(`${V.labels[Math.round(clamp(s.animF, V.lo, V.hi))] ?? ""}${s.playing ? " ▶" : ""}`, 12, 19);
      if (Math.abs(s.zoom - 1) > 0.05) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.textAlign = "right"; ctx.fillText(`×${s.zoom.toFixed(1)}`, W - 12, 19); }
    };
    const loop = (t: number) => { render(t); raf = requestAnimationFrame(loop); };
    renderRef.current = () => render(performance.now());
    render(performance.now());
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); cv.removeEventListener("wheel", onWheel); renderRef.current = null; };
  }, [frames, frameCount, stocks, mode]);

  // 드래그 회전 + 클릭 선택 + 핀치 줌
  const pinchDist = () => { const ps = [...ptrRef.current.values()]; return ps.length < 2 ? 0 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (ptrRef.current.size === 2) { pinchRef.current = pinchDist(); s.dragging = false; return; }
    s.dragging = true; s.moved = 0; s.lastX = e.clientX; s.lastY = e.clientY;
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    if (ptrRef.current.has(e.pointerId)) ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrRef.current.size === 2) {
      const d = pinchDist();
      if (pinchRef.current > 0 && d > 0) { s.zoom = clamp(s.zoom * (d / pinchRef.current), ZOOM_MIN, ZOOM_MAX); pinchRef.current = d; renderRef.current?.(); }
      return;
    }
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
    s.moved += Math.abs(dx) + Math.abs(dy);
    const fine = 1 / Math.sqrt(s.zoom);
    s.yaw += dx * 0.006 * fine; s.pitch = clamp(s.pitch + dy * 0.005 * fine, -1.25, 1.25);
    s.lastX = e.clientX; s.lastY = e.clientY;
    renderRef.current?.();
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    ptrRef.current.delete(e.pointerId);
    if (ptrRef.current.size >= 1) { pinchRef.current = 0; return; }
    s.dragging = false;
    if (s.moved < 6) {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = -1, bd = 18 * 18, bdep = -Infinity;
      posRef.current.forEach((p, i) => { const dd = (p.x - mx) ** 2 + (p.y - my) ** 2; if (dd < 18 * 18 && (dd < bd || p.d > bdep)) { best = i; bd = Math.min(bd, dd); bdep = p.d; } });
      setSelected((c) => (best === -1 ? null : best === c ? null : best));
    }
  };
  const zoomBy = (f: number) => { const s = stRef.current; s.zoom = clamp(s.zoom * f, ZOOM_MIN, ZOOM_MAX); renderRef.current?.(); };
  const resetView = () => { const s = stRef.current; s.zoom = 1; s.yaw = -0.6; s.pitch = 0.35; renderRef.current?.(); };

  const goTo = (v: number) => { const s = stRef.current; s.playing = false; setPlaying(false); s.target = v; setPlayIdx(v); followRef.current = v >= view.hi; };
  const togglePlay = () => {
    const s = stRef.current;
    if (!playing) { followRef.current = false; if (s.target >= view.hi) { s.animF = view.lo; s.target = view.lo; setPlayIdx(view.lo); } s.dwell = 0; s.playing = true; setPlaying(true); }
    else { s.playing = false; setPlaying(false); }
  };
  const switchMode = (m: "live" | "daily" | "cum") => {
    setMode(m);
    const s = stRef.current; s.playing = false; setPlaying(false);
    if (m === "live") { followRef.current = true; goToday(); s.target = 0; s.animF = 0; setPlayIdx(0); }
    else { const v = m === "cum" ? startIdx : endIdx; s.target = v; s.animF = v; setPlayIdx(v); }
  };
  const onStart = (v: number) => { setStartIdx(v); if (v > endIdx) setEndIdx(v); goTo(Math.max(v, playIdx)); };
  const onEnd = (v: number) => { setEndIdx(v); if (v < startIdx) setStartIdx(v); goTo(Math.min(v, playIdx)); };
  const pickDate = (d: string) => { const s = stRef.current; s.playing = false; setPlaying(false); followRef.current = true; pickDateRaw(d); };
  const dateOpts = frames.map((f, i) => <option key={i} value={i}>{f.t}</option>);
  const clampedIdx = clamp(playIdx, view.lo, view.hi);
  const TabBtn = ({ m, label }: { m: "live" | "daily" | "cum"; label: string }) => (
    <button onClick={() => switchMode(m)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${mode === m ? "bg-[#3182f6] text-white" : "bg-white/[0.06] text-white/55 hover:text-white"}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full" style={{ maxWidth: 620 }}>
        <div className="relative w-full overflow-hidden rounded-[20px] bg-[#0b0e0c]" style={{ aspectRatio: "1 / 1" }}>
          <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            className="absolute inset-0 h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" role="img"
            aria-label="3D 관제 구체 — 거래량×수익률×자금유입, 온도=크기" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
          <TabBtn m="live" label="실시간" /><TabBtn m="daily" label="일일" /><TabBtn m="cum" label="누적" />
        </div>
        {mode === "live" && (
          <>
            <select value={liveDate || dayKST()} onChange={(e) => pickDate(e.target.value)} className="rounded-xl bg-base-700 px-2 py-1 text-white/90" title="장중 기록 날짜">
              {days.map((d) => <option key={d} value={d}>{fmtDay(d)}{d === dayKST() ? " (실시간)" : " 기록"}</option>)}
            </select>
            {isToday ? (
              liveClosed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 font-semibold text-white/60">⏹ 장 마감 · 오늘 기록</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f04452]/12 px-3 py-1.5 font-semibold text-[#f04452]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f04452]" />
                  {liveLast ? `LIVE ${liveLast.t}` : "연결 중…"}
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 font-semibold text-white/60">📼 {fmtDay(liveDate)} 기록</span>
            )}
          </>
        )}
        <button onClick={togglePlay} disabled={view.hi <= view.lo} className="rounded-full bg-[#3182f6] px-4 py-1.5 font-semibold text-white transition-colors hover:bg-[#2670e8] disabled:opacity-40">{playing ? "⏸ 정지" : "▶ 재생"}</button>
        {mode !== "live" && (
          <>
            <span className="text-white/45">기간</span>
            <select value={startIdx} onChange={(e) => onStart(+e.target.value)} className="rounded-xl bg-base-700 px-2 py-1 text-white/90">{dateOpts}</select>
            <span className="text-white/35">~</span>
            <select value={endIdx} onChange={(e) => onEnd(+e.target.value)} className="rounded-xl bg-base-700 px-2 py-1 text-white/90">{dateOpts}</select>
          </>
        )}
        <div className="flex items-center gap-0.5 rounded-full bg-white/[0.07] p-1">
          <button onClick={() => zoomBy(1 / 1.35)} aria-label="줌 아웃" className="h-7 w-7 rounded-full text-base font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white">−</button>
          <button onClick={() => zoomBy(1.35)} aria-label="줌 인" className="h-7 w-7 rounded-full text-base font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white">＋</button>
          <button onClick={resetView} aria-label="시점 리셋" className="h-7 rounded-full px-2 text-xs font-semibold text-white/55 transition-colors hover:bg-white/10 hover:text-white">리셋</button>
        </div>
        <button onClick={() => setConstell((v) => !v)} aria-label="성좌 토글"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${constell ? "bg-white/[0.12] text-white" : "bg-white/[0.05] text-white/45 hover:text-white"}`}>
          ✦ 성좌 {constell ? "ON" : "OFF"}
        </button>
      </div>
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <input type="range" min={view.lo} max={Math.max(view.lo, view.hi)} step={1} value={clampedIdx} onChange={(e) => goTo(+e.target.value)} disabled={view.hi <= view.lo} className="flex-1 disabled:opacity-40" />
        <span className="w-32 shrink-0 text-right text-sm font-bold tabular-nums text-white/80">
          {view.labels[clampedIdx] ?? (mode === "live" ? "수집 중…" : "")} {playing ? "재생중" : mode === "live" ? (!isToday ? "기록" : followRef.current ? "LIVE" : "과거") : "고정"}
        </span>
      </div>
      {mode === "live" && (
        <p className="text-center text-[11px] text-white/35">
          {isToday ? (liveClosed ? "장 마감 — 오늘 기록" : "30초마다 스냅샷이 쌓입니다") : `${fmtDay(liveDate)} 장중 기록`} · 드래그 회전 · 휠/핀치 줌 · <strong className="text-white/55">{liveBuf.length}개</strong> 스냅샷
        </p>
      )}

      {/* 판단 근거 카드 — 2D 탭과 동일 구성 */}
      {selected != null && (() => {
        const ob = view.live ? view.overrideB?.[clampedIdx] : undefined;
        const jp = judgePropsFromFrame(mode === "cum" ? endIdx : clampedIdx, selected, () => setSelected(null), ob);
        return jp ? <JudgeCard {...jp} /> : null;
      })()}

      {/* 성좌별 종목 리스트 — 공유 컴포넌트(2D 탭과 동일) */}
      <ThemePanel frameIdx={mode === "cum" ? endIdx : clampedIdx} selected={selected} onSelect={setSelected}
        overrideB={view.live ? view.overrideB?.[clampedIdx] : undefined} />

      <div className="space-y-1 text-center text-[11px] text-white/35">
        <p>
          <strong className="text-white/55">4축</strong> — X <strong className="text-white/50">거래량</strong> · Y <strong className="text-white/50">{mode === "cum" ? "누적수익" : "수익률"}</strong> · Z <strong style={{ color: AMBER }}>자금유입</strong>(검증 생존 신호) · <strong className="text-white/50">크기·발광 = 온도(D²)</strong>. 원점 = 그날 평균 종목.
        </p>
        <p>
          <strong className="text-white/55">색 = 성좌(테마)</strong> · <strong className="text-white/55">✦ = 대장주</strong>(테마의 주도) · 선 = 같은 성좌 연결 · <span style={{ color: SELECT }}>초록 = 선택</span> ·{" "}
          <strong className="text-white/50">줌인하면 고온 별의 이름이 나타납니다</strong>.
          <strong className="text-white/45"> 온도는 방향·매매신호가 아닙니다.</strong>
        </p>
      </div>
    </div>
  );
}
