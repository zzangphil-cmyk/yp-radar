"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DeltaText from "./DeltaText";
import type { QuadrantData, QuadPoint } from "@/lib/npsData";

const OD_T = 0.3; // 지분율 유지 밴드 (±%p)
const R_T = 5; // 추정수익 유지 밴드 (±%)
const XMAX = 4; // 표시 x 범위 (%p)
const YMIN = -100;
const YMAX = 150;

const cxOf = (od: number) => (od < -OD_T ? 0 : od > OD_T ? 2 : 1); // 0축소 1유지 2매집
const cyOf = (r: number) => (r < -R_T ? 0 : r > R_T ? 2 : 1); // 0하락 1유지 2상승

const COLS = ["축소", "유지", "매집"];
const ROWS = ["상승", "유지", "하락"]; // 표시 위→아래 = cy 2,1,0

const INTERP: Record<string, string> = {
  "0-2": "줄였는데 주가 상승 — 차익실현/선제 축소",
  "2-2": "사 모으며 주가도 상승 — 성공적 매집",
  "0-0": "줄이는데 주가도 하락 — 부진주 정리",
  "2-0": "주가 하락 중에 매집 — 역발상/저가 매수",
  "1-2": "비중 유지 + 주가 상승",
  "1-0": "비중 유지 + 주가 하락",
  "2-1": "매집 + 주가 보합",
  "0-1": "축소 + 주가 보합",
  "1-1": "비중·주가 모두 큰 변화 없음",
};

const W = 600, H = 380, padL = 44, padR = 16, padT = 16, padB = 40;

export default function QuadrantChart({ q, compact = false }: { q: QuadrantData; compact?: boolean }) {
  const [ivKey, setIvKey] = useState(q.intervals[q.intervals.length - 2]?.key ?? q.intervals[0].key);
  const [cell, setCell] = useState<{ cx: number; cy: number } | null>(null);

  const points = q.data[ivKey] ?? [];
  const iv = q.intervals.find((i) => i.key === ivKey)!;

  const clampX = (od: number) => Math.max(-XMAX, Math.min(XMAX, od));
  const clampY = (r: number) => Math.max(YMIN, Math.min(YMAX, r));
  const px = (od: number) => padL + ((clampX(od) + XMAX) / (2 * XMAX)) * (W - padL - padR);
  const py = (r: number) => padT + (1 - (clampY(r) - YMIN) / (YMAX - YMIN)) * (H - padT - padB);

  const xb = [px(-XMAX), px(-OD_T), px(OD_T), px(XMAX)];
  const yb = [py(YMAX), py(R_T), py(-R_T), py(YMIN)]; // 위→아래

  // 셀별 카운트
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of points) m[`${cxOf(p.od)}-${cyOf(p.r)}`] = (m[`${cxOf(p.od)}-${cyOf(p.r)}`] ?? 0) + 1;
    return m;
  }, [points]);

  const inCell = (p: QuadPoint) =>
    cell != null && cxOf(p.od) === cell.cx && cyOf(p.r) === cell.cy;

  // 메인(compact): 추정 수익률 상위 (클램프 극단치 제외). 전체 페이지: 실제 매매 크기순
  const listed = useMemo(() => {
    const arr = cell ? points.filter(inCell) : points;
    if (compact)
      return [...arr].filter((p) => p.r < 300 && p.r > -95).sort((a, b) => b.r - a.r);
    return [...arr].sort((a, b) => Math.abs(b.od) - Math.abs(a.od));
  }, [points, cell, compact]);
  const limit = compact ? 10 : 60;

  const fmtR = (r: number) =>
    r >= 300 ? "≥+300%" : r <= -95 ? "≤−95%" : `${r > 0 ? "+" : ""}${r}%`;

  const dotColor = (p: QuadPoint) => (p.r > R_T ? "#f0616d" : p.r < -R_T ? "#4c8dff" : "#7a8aa0");

  return (
    <div className="space-y-4">
      {/* 구간 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/40">구간</span>
        {q.intervals.map((i) => (
          <button
            key={i.key}
            onClick={() => { setIvKey(i.key); setCell(null); }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              ivKey === i.key ? "bg-radar/15 text-radar" : "text-white/55 hover:bg-white/5"
            }`}
          >
            {i.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-white/40">{points.length}종목</span>
      </div>

      {/* 점도표 */}
      <div className="card p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* 클릭 영역 (9분면) */}
          {[0, 1, 2].map((cx) =>
            [2, 1, 0].map((cy) => {
              const rowIdx = 2 - cy; // 위→아래
              const x = xb[cx], w = xb[cx + 1] - xb[cx];
              const y = yb[rowIdx], h = yb[rowIdx + 1] - yb[rowIdx];
              const sel = cell?.cx === cx && cell?.cy === cy;
              return (
                <g key={`${cx}-${cy}`} onClick={() => setCell(sel ? null : { cx, cy })} style={{ cursor: "pointer" }}>
                  <rect x={x} y={y} width={w} height={h}
                    fill={sel ? "rgba(22,199,154,0.12)" : "transparent"}
                    stroke={sel ? "rgba(22,199,154,0.5)" : "transparent"} />
                  <text x={x + 4} y={y + 13} fontSize="10" fill="rgba(255,255,255,0.35)">
                    {counts[`${cx}-${cy}`] ?? 0}
                  </text>
                </g>
              );
            }),
          )}
          {/* 기준선 */}
          <line x1={xb[1]} y1={padT} x2={xb[1]} y2={H - padB} stroke="rgba(255,255,255,0.12)" />
          <line x1={xb[2]} y1={padT} x2={xb[2]} y2={H - padB} stroke="rgba(255,255,255,0.12)" />
          <line x1={padL} y1={yb[1]} x2={W - padR} y2={yb[1]} stroke="rgba(255,255,255,0.12)" />
          <line x1={padL} y1={yb[2]} x2={W - padR} y2={yb[2]} stroke="rgba(255,255,255,0.12)" />
          {/* 0선 */}
          <line x1={padL} y1={py(0)} x2={W - padR} y2={py(0)} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />
          {/* 점 */}
          {points.map((p, i) => {
            const dim = cell != null && !inCell(p);
            return (
              <circle key={i} cx={px(p.od)} cy={py(p.r)} r={inCell(p) ? 3.2 : 2.2}
                fill={dotColor(p)} opacity={dim ? 0.12 : 0.72} />
            );
          })}
          {/* 축 라벨 */}
          <text x={W / 2} y={H - 6} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle">
            지분율 변화 (%p) · ← 축소 / 매집 →
          </text>
          <text x={12} y={H / 2} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle"
            transform={`rotate(-90 12 ${H / 2})`}>
            추정 수익률 (%) · ↓ 하락 / 상승 ↑
          </text>
        </svg>
      </div>

      {/* 선택 안내 */}
      <div className="text-sm">
        {cell ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-radar/15 text-radar">
              {COLS[cell.cx]} · 수익 {ROWS[2 - cell.cy]}
            </span>
            <span className="text-white/60">{INTERP[`${cell.cx}-${cell.cy}`]}</span>
            <button onClick={() => setCell(null)} className="ml-1 text-xs text-white/40 hover:text-white">
              ✕ 전체 보기
            </button>
          </div>
        ) : (
          <span className="text-white/45">분면(칸)을 클릭하면 해당 종목이 아래에 나열됩니다. {iv.label} 기준.</span>
        )}
      </div>

      {/* 리스트 */}
      <div className="card overflow-x-auto scroll-x">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="th">종목</th>
              <th className="th text-right">지분율 변화</th>
              <th className="th text-right">추정 수익률</th>
            </tr>
          </thead>
          <tbody>
            {listed.slice(0, limit).map((p) => (
              <tr key={p.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="td">
                  <Link href={`/nps/stock/${encodeURIComponent(p.slug)}`} className="font-medium text-white hover:text-radar">
                    {p.name}
                  </Link>
                </td>
                <td className="td text-right tabular-nums"><DeltaText v={p.od} /></td>
                <td className="td text-right tabular-nums">
                  <span className={p.r > 0 ? "text-up" : p.r < 0 ? "text-down" : "text-white/50"}>
                    {fmtR(p.r)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compact ? (
        <div className="text-center text-xs text-white/40">
          추정 수익률 상위 {Math.min(limit, listed.length)}종목 · 전체는 ‘크게 보기’
        </div>
      ) : (
        listed.length > limit && (
          <div className="text-center text-xs text-white/40">상위 {limit}종목 표시 / 총 {listed.length}종목</div>
        )
      )}
    </div>
  );
}
