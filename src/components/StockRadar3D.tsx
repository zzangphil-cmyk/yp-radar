"use client";

// [TEST] 3D 관제 구체 — 4축: X 거래량 · Y 수익률 · Z 자금유입(공간) + 온도 D²(크기·발광)
//   원점 = 그날 횡단면 평균. 드래그 회전 · 자동 궤도 · 날짜 슬라이더/재생. 의존성 없는 캔버스 3D.
import { useEffect, useMemo, useRef, useState } from "react";
import { radarData, groupLabel } from "@/lib/radarData";

const SELECT = "#22c55e", AMBER = "#f5a623";
const HOT = 0.4, F_PERS = 3.4;
const ZOOM_MIN = 0.6, ZOOM_MAX = 5, LABEL_ZOOM = 1.7; // 성도(星圖)처럼: 줌인하면 고온 별 이름 표시
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 배경 별밭(고정 시드 — 시차 패럴랙스용)
const STARS = Array.from({ length: 130 }, (_, i) => {
  const h = (i * 2654435761) >>> 0;
  const f = (k: number) => ((h >> k) & 1023) / 1023;
  return { x: f(0), y: f(10), r: f(20) < 0.85 ? 1 : 1.6, a: 0.05 + 0.1 * f(3), p: 0.3 + 0.7 * f(13) };
});

export default function StockRadar3D() {
  const { stocks, frames, frameCount } = radarData;
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef({ animF: frameCount - 1, target: frameCount - 1, yaw: -0.6, pitch: 0.35, zoom: 1, dragging: false, lastX: 0, lastY: 0, moved: 0, auto: true, last: 0, dwell: 0, playing: false });
  const ptrRef = useRef<Map<number, { x: number; y: number }>>(new Map()); // 핀치 줌용 포인터 추적
  const pinchRef = useRef(0);
  const renderRef = useRef<(() => void) | null>(null); // 상호작용 시 즉시 1프레임(백그라운드 RAF 정지 대비)
  const posRef = useRef<{ x: number; y: number; d: number }[]>(stocks.map(() => ({ x: 0, y: 0, d: 0 })));
  const selRef = useRef<number | null>(null);
  const [playIdx, setPlayIdx] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => { selRef.current = selected; }, [selected]);
  useEffect(() => { stRef.current.playing = playing; }, [playing]);

  // 프레임별 [x, y, z(자금유입), temp, ret, grp] — blip: [i,x,y,temp,rel,ret,d2,grp,pct5,zFlow]
  const data = useMemo(() => frames.map((f) => f.b.map((bl) => {
    const b = bl as unknown as number[];
    return [b[1], b[2], (b[9] as number) ?? 0, b[3], b[5], (b[7] as number) ?? -1];
  })), [frames]);
  const dataRef = useRef(data); useEffect(() => { dataRef.current = data; }, [data]);

  // 테마 = 성좌: 테마별 고유 색(황금각 분산 hue) · 대장주 = 테마 내 ETF 노출 1위(stocks가 노출순이라 첫 등장)
  const themeMeta = useMemo(() => {
    const themeOf = stocks.map((st) => st.theme ?? "기타");
    const themes: string[] = []; const idxOf: Record<string, number> = {};
    themeOf.forEach((t) => { if (!(t in idxOf)) { idxOf[t] = themes.length; themes.push(t); } });
    const hue = themes.map((_, k) => Math.round((k * 137.5 + 12) % 360));
    const themeIdx = themeOf.map((t) => idxOf[t]);
    const leader = themes.map(() => -1);
    themeIdx.forEach((k, i) => { if (leader[k] === -1) leader[k] = i; });
    const members = themes.map((_, k) => themeIdx.map((kk, i) => (kk === k ? i : -1)).filter((i) => i >= 0));
    return { themes, hue, themeIdx, leader, members };
  }, [stocks]);
  const themeRef = useRef(themeMeta); useEffect(() => { themeRef.current = themeMeta; }, [themeMeta]);
  const [constell, setConstell] = useState(true); // 성좌(테마 연결선) 토글
  const constellRef = useRef(true);
  useEffect(() => { constellRef.current = constell; renderRef.current?.(); }, [constell]);

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener("resize", resize);
    // 휠 줌(데스크톱) — passive:false로 페이지 스크롤 차단
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const s = stRef.current; s.zoom = clamp(s.zoom * Math.exp(-e.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX); renderRef.current?.(); };
    cv.addEventListener("wheel", onWheel, { passive: false });

    // 3D → 2D 투영 (yaw→pitch 회전 + 원근)
    const proj = (x: number, y: number, z: number, cx: number, cy: number, R: number, cyaw: number, syaw: number, cpit: number, spit: number) => {
      const x1 = x * cyaw + z * syaw, z1 = -x * syaw + z * cyaw;
      const y2 = y * cpit - z1 * spit, z2 = y * spit + z1 * cpit;
      const s = F_PERS / (F_PERS - z2);
      return { px: cx + x1 * R * s, py: cy - y2 * R * s, s, depth: z2 };
    };

    let raf = 0;
    const render = (t: number) => {
      if (!W || !H) resize(); // 마운트 직후 레이아웃 전이면 재측정
      if (!W || !H) return;
      const s = stRef.current;
      const dt = Math.min(60, t - s.last) / 1000; s.last = t;
      // 프레임 이동(재생·슬라이더) — 2D와 동일한 이징
      s.animF += (s.target - s.animF) * (1 - Math.exp(-dt * 7));
      if (Math.abs(s.target - s.animF) < 0.003) s.animF = s.target;
      if (s.playing && s.animF === s.target) {
        s.dwell += dt;
        if (s.dwell >= 0.7) { s.dwell = 0; if (s.target < frameCount - 1) { s.target += 1; setPlayIdx(Math.round(s.target)); } else { s.playing = false; setPlaying(false); } }
      }
      // 자동 궤도(드래그 중 아님)
      if (!s.dragging) s.yaw += dt * 0.12;

      const cx = W / 2, cy = H / 2, R = (Math.min(W, H) / 2 - 30) * s.zoom; // 줌 = 구체 확대
      const cyaw = Math.cos(s.yaw), syaw = Math.sin(s.yaw), cpit = Math.cos(s.pitch), spit = Math.sin(s.pitch);
      const P = (x: number, y: number, z: number) => proj(x, y, z, cx, cy, R, cyaw, syaw, cpit, spit);

      ctx.clearRect(0, 0, W, H);
      // 배경 별밭(회전 시차 — 천문 레이더 감성)
      for (const st of STARS) {
        const px = ((((st.x + s.yaw * 0.04 * st.p) % 1) + 1) % 1) * W;
        const py = ((((st.y + s.pitch * 0.08 * st.p) % 1) + 1) % 1) * H;
        ctx.globalAlpha = st.a; ctx.fillStyle = "#cdd7e3"; ctx.fillRect(px, py, st.r, st.r);
      }
      ctx.globalAlpha = 1;
      // 구 외곽 실루엣 + 위도/경도 링(와이어프레임)
      ctx.strokeStyle = "rgba(31,214,154,0.14)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      const ring = (fx: (a: number) => [number, number, number], style: string) => {
        ctx.strokeStyle = style; ctx.beginPath();
        for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2; const [x, y, z] = fx(a); const p = P(x, y, z); if (k === 0) ctx.moveTo(p.px, p.py); else ctx.lineTo(p.px, p.py); }
        ctx.stroke();
      };
      ring((a) => [Math.cos(a), 0, Math.sin(a)], "rgba(31,214,154,0.16)");            // 적도(XZ)
      ring((a) => [Math.cos(a) * 0.72, 0.66, Math.sin(a) * 0.72], "rgba(31,214,154,0.08)");
      ring((a) => [Math.cos(a) * 0.72, -0.66, Math.sin(a) * 0.72], "rgba(31,214,154,0.08)");
      ring((a) => [Math.cos(a), Math.sin(a), 0], "rgba(255,255,255,0.05)");           // 자오선 XY
      ring((a) => [0, Math.sin(a), Math.cos(a)], "rgba(255,255,255,0.05)");           // 자오선 YZ

      // 축선 + 라벨
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
      axis(0, 1, 0, "rgba(255,255,255,0.10)", "수익률 +", "수익률 −");
      axis(0, 0, 1, "rgba(245,166,35,0.22)", "자금유입 +", "자금유출 −");

      // 원점(그날 평균)
      const o = P(0, 0, 0);
      ctx.fillStyle = "rgba(31,214,154,0.5)"; ctx.beginPath(); ctx.arc(o.px, o.py, 2, 0, 7); ctx.fill();

      // 점: 월드좌표 → 성좌(같은 테마 최근접 연결) → 깊이 정렬 드로우
      const D = dataRef.current;
      const TM = themeRef.current;
      const i0 = clamp(Math.floor(s.animF), 0, frameCount - 1), i1 = Math.min(i0 + 1, frameCount - 1);
      const fr = clamp(s.animF - i0, 0, 1);
      const f0 = D[i0], f1 = D[i1];
      if (f0 && f1) {
        const pts = stocks.map((_, i) => {
          const x = f0[i][0] + (f1[i][0] - f0[i][0]) * fr, y = f0[i][1] + (f1[i][1] - f0[i][1]) * fr, z = f0[i][2] + (f1[i][2] - f0[i][2]) * fr;
          const p = P(x, y, z);
          posRef.current[i] = { x: p.px, y: p.py, d: p.depth };
          return { i, x, y, z, p, temp: f0[i][3], ret: f0[i][4], grp: f0[i][5] };
        });
        // 성좌 선: 각 별을 같은 테마의 최근접 별과 연결(별자리)
        if (constellRef.current) {
          const seen = new Set<number>();
          for (let k = 0; k < TM.members.length; k++) {
            const mem = TM.members[k];
            if (mem.length < 2) continue;
            ctx.strokeStyle = `hsl(${TM.hue[k]} 60% 60%)`; ctx.lineWidth = 1;
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
          const col = isSel ? SELECT : `hsl(${TM.hue[k]} ${hot ? 78 : 48}% ${hot ? 67 : 54}%)`; // 색=성좌(테마), 밝기=온도
          const fog = clamp((p.depth + 1.1) / 2.2, 0, 1);           // 깊이 안개(뒤=흐림)
          const r = (isSel ? 3.5 : isLeader ? 2.8 : 2) * p.s + temp * 6 * p.s;
          const glowK = Math.max(temp, isLeader ? 0.3 : 0);
          if (hot || isSel || isLeader) { ctx.globalAlpha = (0.10 + 0.16 * glowK) * (0.4 + 0.6 * fog); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.px, p.py, r + 6 * (glowK + (isSel ? 0.4 : 0)), 0, 7); ctx.fill(); }
          ctx.globalAlpha = (hot || isSel ? 0.6 + 0.4 * temp : isLeader ? 0.8 : 0.42) * (0.35 + 0.65 * fog);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.px, p.py, r, 0, 7); ctx.fill();
          if (isLeader && !isSel) {
            // 대장주 = 성좌의 으뜸별: ✦ 스파이크 + 상시 이름(테마의 주도는 대장주)
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
            ctx.fillText(`${stocks[i].name} ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}% · ${grp >= 0 ? groupLabel(grp) : ""}`, p.px + r + 8, p.py - r - 6);
          } else if (hot && !isLeader && s.zoom >= LABEL_ZOOM) {
            // 성도(星圖): 줌인하면 고온 별의 이름이 나타남
            ctx.globalAlpha = clamp((s.zoom - LABEL_ZOOM) / 0.6, 0, 0.85) * (0.4 + 0.6 * fog);
            ctx.fillStyle = col; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
            ctx.fillText(stocks[i].name, p.px + r + 5, p.py + 3);
          }
          ctx.globalAlpha = 1;
        }
      }
      // 날짜 라벨 + 줌 배율
      ctx.fillStyle = "rgba(31,214,154,0.5)"; ctx.font = "12px monospace"; ctx.textAlign = "left";
      ctx.fillText(`${frames[Math.round(clamp(s.animF, 0, frameCount - 1))]?.t ?? ""}${s.playing ? " ▶" : ""}`, 12, 19);
      if (Math.abs(s.zoom - 1) > 0.05) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.textAlign = "right"; ctx.fillText(`×${s.zoom.toFixed(1)}`, W - 12, 19); }
    };
    const loop = (t: number) => { render(t); raf = requestAnimationFrame(loop); };
    renderRef.current = () => render(performance.now()); // 상호작용 즉시 드로우용
    render(performance.now()); // 첫 프레임 동기(백그라운드 탭 RAF 지연 대비)
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); cv.removeEventListener("wheel", onWheel); renderRef.current = null; };
  }, [frames, frameCount, stocks]);

  // 드래그 회전 + 클릭 선택 + 핀치 줌(두 손가락)
  const pinchDist = () => { const ps = [...ptrRef.current.values()]; return ps.length < 2 ? 0 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (ptrRef.current.size === 2) { pinchRef.current = pinchDist(); s.dragging = false; return; } // 핀치 시작
    s.dragging = true; s.moved = 0; s.lastX = e.clientX; s.lastY = e.clientY;
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    if (ptrRef.current.has(e.pointerId)) ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrRef.current.size === 2) { // 핀치 줌
      const d = pinchDist();
      if (pinchRef.current > 0 && d > 0) { s.zoom = clamp(s.zoom * (d / pinchRef.current), ZOOM_MIN, ZOOM_MAX); pinchRef.current = d; renderRef.current?.(); }
      return;
    }
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
    s.moved += Math.abs(dx) + Math.abs(dy);
    const fine = 1 / Math.sqrt(s.zoom); // 줌인할수록 미세 회전
    s.yaw += dx * 0.006 * fine; s.pitch = clamp(s.pitch + dy * 0.005 * fine, -1.25, 1.25);
    s.lastX = e.clientX; s.lastY = e.clientY;
    renderRef.current?.();
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    ptrRef.current.delete(e.pointerId);
    if (ptrRef.current.size >= 1) { pinchRef.current = 0; return; } // 핀치 잔여 손가락
    s.dragging = false;
    if (s.moved < 6) { // 클릭 = 선택
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = -1, bd = 18 * 18, bdep = -Infinity;
      posRef.current.forEach((p, i) => { const dd = (p.x - mx) ** 2 + (p.y - my) ** 2; if (dd < bd || (dd < 18 * 18 && p.d > bdep)) { if (dd < 18 * 18) { best = i; bd = Math.min(bd, dd); bdep = p.d; } } });
      setSelected((c) => (best === -1 ? null : best === c ? null : best));
    }
  };
  const zoomBy = (f: number) => { const s = stRef.current; s.zoom = clamp(s.zoom * f, ZOOM_MIN, ZOOM_MAX); renderRef.current?.(); };
  const resetView = () => { const s = stRef.current; s.zoom = 1; s.yaw = -0.6; s.pitch = 0.35; renderRef.current?.(); };

  const goTo = (v: number) => { const s = stRef.current; s.playing = false; setPlaying(false); s.target = v; setPlayIdx(v); };
  const togglePlay = () => {
    const s = stRef.current;
    if (!playing) { if (s.target >= frameCount - 1) { s.animF = 0; s.target = 0; setPlayIdx(0); } s.dwell = 0; s.playing = true; setPlaying(true); }
    else { s.playing = false; setPlaying(false); }
  };

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
        <button onClick={togglePlay} className="rounded-full bg-[#3182f6] px-4 py-1.5 font-semibold text-white transition-colors hover:bg-[#2670e8]">{playing ? "⏸ 정지" : "▶ 재생"}</button>
        <div className="flex items-center gap-0.5 rounded-full bg-white/[0.07] p-1">
          <button onClick={() => zoomBy(1 / 1.35)} aria-label="줌 아웃" className="h-7 w-7 rounded-full text-base font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white">−</button>
          <button onClick={() => zoomBy(1.35)} aria-label="줌 인" className="h-7 w-7 rounded-full text-base font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white">＋</button>
          <button onClick={resetView} aria-label="시점 리셋" className="h-7 rounded-full px-2 text-xs font-semibold text-white/55 transition-colors hover:bg-white/10 hover:text-white">리셋</button>
        </div>
        <button onClick={() => setConstell((v) => !v)} aria-label="성좌 토글"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${constell ? "bg-white/[0.12] text-white" : "bg-white/[0.05] text-white/45 hover:text-white"}`}>
          ✦ 성좌 {constell ? "ON" : "OFF"}
        </button>
        <span className="text-white/45">드래그 회전 · 휠/핀치 줌 · 클릭 선택</span>
      </div>

      {/* 성좌(테마) 색상 범례 */}
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
        {themeMeta.themes.map((t, k) => (
          <span key={t} className="inline-flex items-center gap-1 text-white/55">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(${themeMeta.hue[k]} 65% 60%)` }} />
            {t}
          </span>
        ))}
      </div>
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <input type="range" min={0} max={frameCount - 1} step={1} value={playIdx} onChange={(e) => goTo(+e.target.value)} className="flex-1" />
        <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums text-white/80">{frames[playIdx]?.t}</span>
      </div>

      <div className="space-y-1 text-center text-[11px] text-white/35">
        <p>
          <strong className="text-white/55">4축</strong> — X <strong className="text-white/50">거래량</strong> · Y <strong className="text-white/50">수익률</strong> · Z <strong style={{ color: AMBER }}>자금유입</strong>(시총 통제 거래대금, 검증 생존 신호) · <strong className="text-white/50">크기·발광 = 온도(D²)</strong>. 원점 = 그날 평균 종목.
        </p>
        <p>
          <strong className="text-white/55">색 = 성좌(테마)</strong> · 밝기·크기 = 온도(D²) · <strong className="text-white/55">✦ 스파이크 = 대장주</strong>(테마 내 ETF 노출 1위 — 테마의 주도) · 선 = 같은 성좌 연결 · <span style={{ color: SELECT }}>초록 = 선택</span> ·{" "}
          <strong className="text-white/50">줌인하면 고온 별의 이름이 나타납니다(성도처럼)</strong>.
          <strong className="text-white/45"> 온도는 방향·매매신호가 아닙니다.</strong>
        </p>
      </div>
    </div>
  );
}
