"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { radarData } from "@/lib/radarData";
import { JudgeCard, ThemePanel, useLiveDay, dayKST, fmtDay, themeMeta } from "./radarShared";

const UP = "#f04452", DOWN = "#4c82fb", SELECT = "#22c55e", AMBER = "#f5a623";
const GROUP_LABELS = ["거래량", "고유수익", "변동성", "자금유입"]; // 온도(D²)를 띄운 주 원인
const HOT = 0.4, VOL_EDGE = 3.2, RET_DAILY = 14, DZ = 0.5;
const ZOOM_MIN = 0.6, ZOOM_MAX = 5, LABEL_ZOOM = 1.6; // 3D와 동일한 줌·성도 라벨
const xTicks = [{ x: -0.63, l: "÷4" }, { x: -0.31, l: "÷2" }, { x: 0, l: "평균" }, { x: 0.31, l: "×2" }, { x: 0.63, l: "×4" }];
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
  const stRef = useRef({ animF: frameCount - 1, target: frameCount - 1, shown: frameCount - 1, dwell: 0, sweep: -Math.PI / 2, playing: false, last: 0, zoom: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0, moved: 0 });
  const ptrRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef(0);
  const renderRef = useRef<(() => void) | null>(null); // 상호작용 즉시 드로우(백그라운드 RAF 정지 대비)
  const selRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number }[]>(stocks.map(() => ({ x: 0, y: 0 })));
  const [mode, setMode] = useState<"cum" | "daily" | "live">("daily");
  const [startIdx, setStartIdx] = useState(Math.max(0, frameCount - 5));
  const [endIdx, setEndIdx] = useState(frameCount - 1);
  const [playIdx, setPlayIdx] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // 실시간 하루 버퍼 — 공유 훅(radarShared.useLiveDay): 히스토리 시딩·폴링·IDB·기록일 관리 (3D 탭과 동일)
  const { liveBuf, liveDate, days, isToday, liveClosed, liveLast, loadSeq, pickDate: pickDateRaw, goToday } = useLiveDay(mode === "live");
  const followRef = useRef(true); // 최신 추종(끝에 있으면 새 프레임 도착 시 자동 이동)
  // 날짜 로드·시딩 시 애니메이션 리셋
  useEffect(() => { followRef.current = true; const st = stRef.current; st.target = 0; st.animF = 0; }, [loadSeq]);
  // 최신 추종: 오늘·실시간이고 끝을 보고 있을 때만(과거·재생·이전시점이면 가로채지 않음)
  useEffect(() => {
    if (mode === "live" && isToday && followRef.current && !stRef.current.playing && liveBuf.length) {
      const hi = liveBuf.length - 1; stRef.current.target = hi; setPlayIdx(hi);
    }
  }, [liveBuf.length, mode, isToday]);

  // 보기 데이터: 누적(시작일 대비) 또는 일일. 좌표·이상점수 산출.
  const view = useMemo(() => {
    const N = stocks.length;
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
      return { f, retEdge: RET_DAILY, lo: 0, hi, yTitle: "등락률 (평균 대비) ↑초과 / 미달↓", live: true };
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
      return { f, retEdge: RET_DAILY, lo: startIdx, hi: endIdx, yTitle: "등락률 (평균 대비) ↑초과 / 미달↓" };
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
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const f: { t: string; b: (number | number[])[][] }[] = [];
    for (let d = startIdx; d <= endIdx; d++) {
      // 축 원점 = 구간 횡단면 평균(중앙값)
      const Lmed = med(raw[d].map((r) => Math.log2(Math.max(r.av, 1e-6)))), Rmed = med(raw[d].map((r) => r.cr));
      const b: (number | number[])[][] = [];
      for (let i = 0; i < N; i++) {
        const { cr, av, mkt, secDev, spec } = raw[d][i];
        const x = clamp((Math.log2(Math.max(av, 1e-6)) - Lmed) / VOL_EDGE, -1, 1);
        const y = clamp((cr - Rmed) / retEdge, -1, 1);
        const a = clamp((Math.hypot(x, y) - DZ) / (1 - DZ), 0, 1);
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
    // 휠 줌(3D와 동일) — passive:false로 페이지 스크롤 차단
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const s = stRef.current; s.zoom = clamp(s.zoom * Math.exp(-e.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX); renderRef.current?.(); };
    cv.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0;
    const render = (t: number) => {
      if (!W || !H) resize();
      if (!W || !H) return;
      const s = stRef.current, V = viewRef.current;
      const dt = Math.min(60, t - s.last) / 1000; s.last = t;
      s.animF += (s.target - s.animF) * (1 - Math.exp(-dt * 7));
      if (Math.abs(s.target - s.animF) < 0.003) s.animF = s.target;
      const moving = s.animF !== s.target;
      const liveOn = !!(V as { live?: boolean }).live; // 실시간: 스윕 계속 회전(살아있게)
      if (s.playing) {
        if (!moving) { s.dwell += dt; if (s.dwell >= 0.6) { if (s.target < V.hi) { s.target += 1; s.dwell = 0; } else { s.playing = false; setPlaying(false); s.dwell = 0; followRef.current = true; } } }
        const di = Math.round(s.animF); if (di !== s.shown) { s.shown = di; setPlayIdx(di); }
      } else s.dwell = 0;
      if (s.playing || moving || liveOn) s.sweep += dt * 0.7;

      // 줌·팬: 원점(ox,oy) = 중심 + 팬, 반지름 = 기본 × 줌
      const cx = W / 2, cy = H / 2, R0 = Math.min(W, H) / 2 - 22;
      const R = R0 * s.zoom, ox = cx + s.panX, oy = cy + s.panY;
      let i0 = clamp(Math.floor(s.animF), V.lo, V.hi); const i1 = Math.min(i0 + 1, V.hi);
      const fr = clamp(s.animF - i0, 0, 1);
      const f0 = V.f[i0]?.b, f1 = V.f[i1]?.b; const E = V.retEdge;
      if (!f0 || !f1) return;
      const mapX = (x: number) => ox + x * R * 0.92, mapY = (y: number) => oy - y * R * 0.92;
      const sel = selRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(31,214,154,0.11)"; ctx.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(ox, oy, R * k / 4, 0, 7); ctx.stroke(); }
      ctx.fillStyle = "rgba(31,214,154,0.045)"; ctx.beginPath(); ctx.arc(ox, oy, R * 0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.moveTo(ox - R, oy); ctx.lineTo(ox + R, oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy - R); ctx.lineTo(ox, oy + R); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      for (const tk of xTicks) ctx.fillText(tk.l, mapX(tk.x), oy + 13);
      ctx.textAlign = "left";
      const half = Math.round(E / 2);
      for (const tk of [{ p: E, l: `+${E}%` }, { p: half, l: `+${half}%` }, { p: -half, l: `−${half}%` }, { p: -E, l: `−${E}%` }])
        ctx.fillText(tk.l, ox + 5, mapY(tk.p / E) + 3);
      if (s.playing || moving || liveOn) {
        const g = ctx.createConicGradient(s.sweep, ox, oy);
        g.addColorStop(0, "rgba(31,214,154,0)"); g.addColorStop(0.9, "rgba(31,214,154,0)");
        g.addColorStop(0.99, "rgba(31,214,154,0.12)"); g.addColorStop(1, "rgba(31,214,154,0.22)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, R, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(s.sweep); ctx.strokeStyle = "rgba(31,214,154,0.4)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,0.34)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("거래량 (그날 평균 대비) →", cx, H - 8);
      ctx.save(); ctx.translate(14, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(V.yTitle, 0, 0); ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(31,214,154,0.45)"; ctx.font = "12px monospace";
      ctx.fillText(`${V.f[Math.round(clamp(s.animF, V.lo, V.hi))]?.t ?? ""}${s.playing ? " ▶" : " ⏸"}`, 12, 19);
      if (Math.abs(s.zoom - 1) > 0.05) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.textAlign = "right"; ctx.fillText(`×${s.zoom.toFixed(1)}`, W - 12, 19); ctx.textAlign = "left"; }

      const swA = ((s.sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const orderList = [...stocks.keys()].sort((a, c) => (f0[a][3] as number) - (f0[c][3] as number));
      for (const i of orderList) {
        const a0 = f0[i] as number[], a1 = f1[i] as number[];
        const x = a0[1] + (a1[1] - a0[1]) * fr, y = a0[2] + (a1[2] - a0[2]) * fr;
        const anomaly = a0[3], ret = a0[5], grp = a0[10] ?? -1;
        const isSel = sel === i, hot = anomaly >= HOT;
        const tk = themeMeta.themeIdx[i], isLeader = themeMeta.leader[tk] === i;
        // 색 = 성좌(테마, 3D와 동일) · 밝기 = 온도
        const col = isSel ? SELECT : `hsl(${themeMeta.hue[tk]} ${hot ? 88 : 62}% ${hot ? 68 : 56}%)`;
        const px = mapX(x), py = mapY(y); posRef.current[i] = { x: px, y: py };
        const dim = sel != null && !isSel && !hot ? 0.4 : 1;
        let ang = Math.atan2(-y, x); ang = (ang + 2 * Math.PI) % (2 * Math.PI);
        let d = swA - ang; d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const lit = (s.playing || moving || liveOn) && d < 0.5 ? 1 - d / 0.5 : 0;
        const r = isSel ? 4 + anomaly * 4 : (isLeader ? 3 : 2.3) + anomaly * 5;
        if (isSel || hot || isLeader) { ctx.globalAlpha = 0.15 * Math.max(anomaly, lit, isSel ? 0.6 : 0, isLeader ? 0.3 : 0) * dim; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r + 7 * Math.max(anomaly, lit, isSel ? 0.7 : 0, isLeader ? 0.3 : 0), 0, 7); ctx.fill(); }
        ctx.globalAlpha = (hot || isSel ? 0.6 + 0.4 * Math.max(anomaly, lit) : isLeader ? 0.75 : 0.4 + 0.2 * lit) * dim;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        if (isLeader && !isSel) {
          // ✦ 대장주(3D와 동일): 스파이크 + 상시 이름
          ctx.globalAlpha = 0.8 * dim; ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - r - 6, py); ctx.lineTo(px - r - 1.5, py); ctx.moveTo(px + r + 1.5, py); ctx.lineTo(px + r + 6, py);
          ctx.moveTo(px, py - r - 6); ctx.lineTo(px, py - r - 1.5); ctx.moveTo(px, py + r + 1.5); ctx.lineTo(px, py + r + 6);
          ctx.stroke();
          ctx.globalAlpha = 0.55 * dim; ctx.fillStyle = col; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
          ctx.fillText(stocks[i].name, px + r + 8, py + 3);
        }
        if (isSel) { ctx.globalAlpha = s.playing ? 0.6 + 0.4 * Math.abs(Math.sin(t / 350)) : 0.9; ctx.strokeStyle = SELECT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, r + 5, 0, 7); ctx.stroke(); }
        else if (hot) { ctx.globalAlpha = 0.5 * Math.max(anomaly, lit) * dim; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 7); ctx.stroke(); }
        if (isSel) {
          const why = grp >= 0 ? GROUP_LABELS[grp] : "수익률";
          ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(34,197,94,0.5)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px + r, py - r); ctx.lineTo(px + r + 7, py - r - 7); ctx.lineTo(px + r + 92, py - r - 7); ctx.stroke();
          ctx.fillStyle = col; ctx.font = "11px monospace"; ctx.textAlign = "left";
          ctx.fillText(`${stocks[i].name} ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}% · ${why}`, px + r + 9, py - r - 10);
        } else if (hot && !isLeader && s.zoom >= LABEL_ZOOM) {
          // 성도(星圖): 줌인하면 고온 점의 이름이 나타남(3D와 동일)
          ctx.globalAlpha = clamp((s.zoom - LABEL_ZOOM) / 0.6, 0, 0.85) * dim;
          ctx.fillStyle = col; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
          ctx.fillText(stocks[i].name, px + r + 5, py + 3);
        }
        ctx.globalAlpha = 1;
      }
    };
    const loop = (t: number) => { render(t); raf = requestAnimationFrame(loop); };
    renderRef.current = () => render(performance.now());
    render(performance.now()); // 첫 프레임 동기
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); cv.removeEventListener("wheel", onWheel); renderRef.current = null; };
  }, [frames, frameCount, stocks]);

  // 드래그 팬 + 클릭 선택 + 핀치 줌(3D와 동일 조작감)
  const pinchDist = () => { const ps = [...ptrRef.current.values()]; return ps.length < 2 ? 0 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    ptrRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (ptrRef.current.size === 2) { pinchRef.current = pinchDist(); s.dragging = false; return; }
    s.dragging = true; s.moved = 0; s.lastX = e.clientX; s.lastY = e.clientY;
  };
  const onMoveC = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    s.panX += dx; s.panY += dy; // 2D는 드래그 = 이동(팬)
    s.lastX = e.clientX; s.lastY = e.clientY;
    renderRef.current?.();
  };
  const onUpC = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stRef.current;
    ptrRef.current.delete(e.pointerId);
    if (ptrRef.current.size >= 1) { pinchRef.current = 0; return; }
    s.dragging = false;
    if (s.moved < 6) {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = -1, bd = 16 * 16;
      posRef.current.forEach((p, i) => { const dd = (p.x - mx) ** 2 + (p.y - my) ** 2; if (dd < bd) { bd = dd; best = i; } });
      setSelected((cur) => (best === -1 ? null : best === cur ? null : best));
    }
  };
  const zoomBy = (f: number) => { const s = stRef.current; s.zoom = clamp(s.zoom * f, ZOOM_MIN, ZOOM_MAX); renderRef.current?.(); };
  const resetViewport = () => { const s = stRef.current; s.zoom = 1; s.panX = 0; s.panY = 0; renderRef.current?.(); };

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
    if (!playing) { followRef.current = false; if (s.target >= hi) { s.animF = lo; s.target = lo; s.shown = lo; setPlayIdx(lo); } s.dwell = 0; s.playing = true; setPlaying(true); }
    else { s.playing = false; setPlaying(false); }
  };
  const switchMode = (m: "cum" | "daily" | "live") => {
    setMode(m);
    if (m === "live") { followRef.current = true; goToday(); const s = stRef.current; s.playing = false; setPlaying(false); s.target = 0; s.animF = 0; s.shown = 0; setPlayIdx(0); }
    else goTo(m === "cum" ? startIdx : endIdx);
  };
  const pickDate = (d: string) => { const st = stRef.current; st.playing = false; setPlaying(false); followRef.current = true; pickDateRaw(d); };

  const List = ({ title, accent, rows, kind }: { title: string; accent: string; rows: typeof lists.up; kind: "hot" | "up" | "down" }) => (
    <div className="rounded-[20px] bg-base-800 p-3">
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

  // 판단 근거 카드 — 공유 컴포넌트(radarShared.JudgeCard, 3D 탭과 동일). 여기선 view 행에서 프롭만 계산.
  const JudgmentCard = () => {
    if (selected == null) return null;
    const s = stocks[selected]; const row = view.f[playIdx]?.b[selected]; if (!s || !row) return null;
    return (
      <JudgeCard
        code={s.code} name={s.name} market={s.market}
        temp={row[3] as number} retPct={row[5] as number} grp={(row[10] ?? -1) as number}
        mkt={(row[11] ?? 0) as number} secDev={(row[12] ?? 0) as number} spec={(row[7] ?? 0) as number}
        led={(row[6] ?? 0) as number} perc={(row[13] ?? []) as number[]}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full" style={{ maxWidth: 540 }}>
        <div className="relative w-full overflow-hidden rounded-[20px] bg-[#0b0e0c]" style={{ aspectRatio: "1 / 1" }}>
          <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMoveC} onPointerUp={onUpC} onPointerCancel={onUpC} className="absolute inset-0 h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" role="img" aria-label="종목 관제 레이더 — 거래량 배수×등락률, 날짜 범위 스냅샷/누적" />
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
          <button onClick={resetViewport} aria-label="시점 리셋" className="h-7 rounded-full px-2 text-xs font-semibold text-white/55 transition-colors hover:bg-white/10 hover:text-white">리셋</button>
        </div>
      </div>
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <input type="range" min={view.lo} max={Math.max(view.lo, view.hi)} step={1} value={clamp(playIdx, view.lo, view.hi)} onChange={(e) => goTo(+e.target.value)} disabled={view.hi <= view.lo} className="flex-1 disabled:opacity-40" />
        <span className="w-32 shrink-0 text-right text-sm font-bold tabular-nums text-white/80">
          {view.f[clamp(playIdx, view.lo, view.hi)]?.t ?? (mode === "live" ? "수집 중…" : "")} {playing ? "재생중" : mode === "live" ? (!isToday ? "기록" : followRef.current ? "LIVE" : "과거") : "고정"}
        </span>
      </div>
      {mode === "live" && (
        <p className="text-center text-[11px] text-white/35">
          {isToday ? (liveClosed ? "장 마감 — 오늘 기록(폴링 중지)" : "30초마다 스냅샷이 쌓입니다") : `${fmtDay(liveDate)} 장중 기록`} · 슬라이더·▶ 재생으로 <strong className="text-white/55">움직임</strong>을 보고, <strong className="text-white/55">날짜</strong>를 바꾸면 그날 장중 기록을 봅니다 · <strong className="text-white/55">{liveBuf.length}개</strong> 스냅샷
        </p>
      )}

      {selected != null && <JudgmentCard />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <List title="온도 상위 (평소와 다른 정도)" accent={AMBER} rows={lists.hot} kind="hot" />
        <List title={mode === "cum" ? "누적 상승 상위" : "상승률 상위"} accent={UP} rows={lists.up} kind="up" />
        <List title={mode === "cum" ? "누적 하락 상위" : "하락률 상위"} accent={DOWN} rows={lists.down} kind="down" />
      </div>

      {/* 성좌별 종목 리스트 — 3D 탭과 동일 구성(실시간 모드는 프레임 불일치로 제외) */}
      {mode !== "live" && <ThemePanel frameIdx={playIdx} selected={selected} onSelect={setSelected} />}

      <div className="space-y-1 text-center text-[11px] text-white/35">
        <p>
          <strong className="text-white/55">크기·밝기 = 온도</strong>(D², 지금 평소와 얼마나 다른가) — 거래량·고유수익·변동성·자금유입 5축의 동시 이탈 강도.
        </p>
        <p>
          <strong className="text-white/55">색 = 성좌(테마)</strong> · <strong className="text-white/55">✦ = 대장주</strong>(테마의 주도) · <span style={{ color: SELECT }}>초록 = 선택</span> ·{" "}
          드래그 이동 · 휠/핀치 줌 · <strong className="text-white/50">줌인하면 고온 점의 이름이 나타납니다</strong>. &ldquo;왜 떴나&rdquo;는 점 선택 시 카드에서.
        </p>
        <p className="text-white/45"><strong>온도는 &ldquo;크게 움직이는 중&rdquo;을 뜻할 뿐, 방향(오를지/내릴지)·매매신호가 아닙니다. 투자자문 아님.</strong></p>
      </div>
    </div>
  );
}
